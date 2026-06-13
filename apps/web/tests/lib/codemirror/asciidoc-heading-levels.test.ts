import {
  MAX_HEADING_LEVEL,
  parseLevelOffset,
  computeHeadingLevels,
  headingLevelClass,
} from '@/lib/codemirror/asciidoc-heading-levels';

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
});

describe('headingLevelClass', () => {
  test('emits a per-level class', () => {
    expect(headingLevelClass({ line: 1, from: 0, rawLevel: 1, effectiveLevel: 2, discrete: false, beyondMax: false }))
      .toBe('cm-ad-h2');
  });
  test('adds the discrete class', () => {
    expect(headingLevelClass({ line: 1, from: 0, rawLevel: 0, effectiveLevel: 0, discrete: true, beyondMax: false }))
      .toBe('cm-ad-h0 cm-ad-discrete');
  });
});
