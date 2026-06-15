import {
  MAX_HEADING_LEVEL,
  parseLevelOffset,
  computeHeadingLevels,
  isBoundaryBlockConstruct,
} from '@/lib/codemirror/asciidoc-effective-levels';

describe('parseLevelOffset', () => {
  test('relative +N / -N', () => {
    expect(parseLevelOffset(':leveloffset: +1')).toEqual({ kind: 'relative', delta: 1 });
    expect(parseLevelOffset(':leveloffset: -2')).toEqual({ kind: 'relative', delta: -2 });
  });
  test('absolute N', () => {
    expect(parseLevelOffset(':leveloffset: 2')).toEqual({ kind: 'set', value: 2 });
  });
  test('unset via ! or empty', () => {
    expect(parseLevelOffset(':leveloffset!:')).toEqual({ kind: 'unset' });
    expect(parseLevelOffset(':leveloffset:')).toEqual({ kind: 'unset' });
  });
  test('non-leveloffset line → null', () => {
    expect(parseLevelOffset(':author: x')).toBeNull();
    expect(parseLevelOffset('== Heading')).toBeNull();
  });
});

describe('computeHeadingLevels', () => {
  test('raw levels from marker count (== → 1, === → 2)', () => {
    const infos = computeHeadingLevels('= Title\n\n== One\n\n=== Two\n');
    expect(infos.map((index) => index.effectiveLevel)).toEqual([0, 1, 2]);
    expect(infos.map((index) => index.rawLevel)).toEqual([0, 1, 2]);
  });

  test('in-file :leveloffset: +1 shifts subsequent headings (document order)', () => {
    const source = '== Before\n\n:leveloffset: +1\n\n== After\n';
    const infos = computeHeadingLevels(source);
    expect(infos[0].effectiveLevel).toBe(1); // before the offset
    expect(infos[1].effectiveLevel).toBe(2); // shifted by +1
  });

  test(':leveloffset!: unsets back to the inherited base', () => {
    const source = ':leveloffset: +2\n\n== A\n\n:leveloffset!:\n\n== B\n';
    const infos = computeHeadingLevels(source);
    expect(infos[0].effectiveLevel).toBe(3); // 1 + 2
    expect(infos[1].effectiveLevel).toBe(1); // reset
  });

  test('absolute :leveloffset: 0 then relative', () => {
    const source = ':leveloffset: 1\n\n== A\n\n:leveloffset: +1\n\n== B\n';
    const infos = computeHeadingLevels(source);
    expect(infos[0].effectiveLevel).toBe(2); // 1 + 1
    expect(infos[1].effectiveLevel).toBe(3); // 1 + 1 + 1
  });

  test('inherited offset is added to every heading', () => {
    const infos = computeHeadingLevels('== A\n', 2);
    expect(infos[0].effectiveLevel).toBe(3);
  });

  test('effective level beyond MAX is flagged (FR-010)', () => {
    const source = ':leveloffset: +5\n\n====== Deep\n';
    const infos = computeHeadingLevels(source);
    expect(infos[0].effectiveLevel).toBeGreaterThan(MAX_HEADING_LEVEL);
    expect(infos[0].beyondMax).toBe(true);
  });

  test('[discrete] / [float] headings are recognised (FR-072)', () => {
    const source = '[discrete]\n== Discrete One\n\n[float]\n=== Float Two\n\n== Normal\n';
    const infos = computeHeadingLevels(source);
    expect(infos[0].discrete).toBe(true);
    expect(infos[1].discrete).toBe(true);
    expect(infos[2].discrete).toBe(false);
  });

  test('headings inside a verbatim block are not counted', () => {
    const source = '== Real\n\n----\n== Not a heading\n----\n\n== Also Real\n';
    const infos = computeHeadingLevels(source);
    expect(infos.map((index) => index.line)).toEqual([1, 7]);
  });

  test('from offsets point at the line start', () => {
    const source = 'intro\n\n== Section\n';
    const infos = computeHeadingLevels(source);
    expect(source.slice(infos[0].from, infos[0].from + 2)).toBe('==');
  });

  // ── Block-boundary rule (paragraph absorption) ───────────────────────────────
  // A `==`-line glued to preceding prose (no blank line) is paragraph text, not a heading,
  // so it must never be folded or font-styled as one. Mirrors Asciidoctor + the Lezer grammar.

  test('a heading glued under prose is absorbed into the paragraph (not a heading)', () => {
    const infos = computeHeadingLevels('Some prose text\n== Section Foo\n');
    expect(infos).toHaveLength(0);
  });

  test('a heading after a closed delimited block (no blank line) is a heading', () => {
    // Asciidoctor renders `<h2>` here — a closing delimiter is a block boundary.
    const infos = computeHeadingLevels('****\nSidebar block\n****\n== Section Foo\n');
    expect(infos.map((info) => info.line)).toEqual([4]);
  });

  test('a blank line ends the paragraph so the next heading is recognised', () => {
    const infos = computeHeadingLevels('Some prose text\n\n== Section Foo\n');
    expect(infos.map((info) => info.line)).toEqual([3]);
  });

  test('headings glued under single-line block constructs are still headings', () => {
    for (const opener of ['[#myid]', '[.lead]', '.Block title', '// a comment', ':attr: val', 'image::pic.png[]']) {
      const infos = computeHeadingLevels(`${opener}\n== Heading\n`);
      expect(infos.map((info) => info.line)).toEqual([2]);
    }
  });

  test('a heading is suppressed after a list item with no blank line', () => {
    const infos = computeHeadingLevels('* item\n== Heading\n');
    expect(infos).toHaveLength(0);
  });

  test('only the first of a prose-glued heading run is absorbed; later sections still parse', () => {
    const infos = computeHeadingLevels('intro\n== Glued\n\n== Real\n');
    expect(infos.map((info) => info.line)).toEqual([4]);
  });
});

describe('isBoundaryBlockConstruct', () => {
  test('recognises attribute entries, block-attr/anchor lines, block titles, comments, block macros', () => {
    for (const line of [':attr: v', ':attr!:', '[.lead]', '[#id]', '[[id]]', '.Title', '// note', 'image::x.png[]']) {
      expect(isBoundaryBlockConstruct(line)).toBe(true);
    }
  });

  test('plain prose and list markers are not block constructs', () => {
    for (const line of ['Some prose', '* item', '- item', 'word word', '. ordered']) {
      expect(isBoundaryBlockConstruct(line)).toBe(false);
    }
  });
});
