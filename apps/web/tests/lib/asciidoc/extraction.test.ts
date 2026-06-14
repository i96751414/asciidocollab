import {
  headingToId,
  parseIncludeLevelOffset,
  extractReferences,
  extractSymbols,
  resolveReference,
  buildIncludeGraph,
  inheritedLevelOffset,
} from '@/lib/asciidoc/extraction';
import type { ProjectSymbol, Reference } from '@asciidocollab/shared';

// Unit coverage for the editor-side (presentation) AsciiDoc extraction copy. The
// authoritative rules live in @asciidocollab/domain (tested there); this mirrors them
// for the live unsaved buffer, so the cases here lock the two copies in agreement.

describe('headingToId', () => {
  test('slugifies heading text Asciidoctor-style', () => {
    expect(headingToId('Getting Started')).toBe('_getting_started');
  });

  test('collapses punctuation runs and trims leading/trailing underscores', () => {
    expect(headingToId('  Hello, World!  ')).toBe('_hello_world');
    expect(headingToId('A & B / C')).toBe('_a_b_c');
  });
});

describe('parseIncludeLevelOffset', () => {
  test.each([
    ['leveloffset=+1', 1],
    ['leveloffset=-2', -2],
    ['leveloffset = 3', 3],
    ['', 0],
    ['lines=1..5', 0],
  ])('parses %j as %i', (attributes, expected) => {
    expect(parseIncludeLevelOffset(attributes)).toBe(expected);
  });
});

describe('extractReferences', () => {
  test('extracts xref (both <<>> and xref: forms), include, image, and attribute refs', () => {
    const content = [
      'See <<intro>> and <<sec,label>>.',
      'Also xref:other.adoc#part[Part].',
      'include::chapter.adoc[leveloffset=+1]',
      'image::diagram.png[Diagram]',
      'Version {version} here.',
    ].join('\n');
    const references = extractReferences('f1', content);
    const kinds = references.map((reference) => `${reference.kind}:${reference.target}`);
    expect(kinds).toContain('xref:intro');
    expect(kinds).toContain('xref:sec');
    expect(kinds).toContain('xref:other.adoc#part');
    expect(kinds).toContain('include:chapter.adoc');
    expect(kinds).toContain('image:diagram.png');
    expect(kinds).toContain('attributeRef:version');
    expect(references.every((reference) => reference.fileId === 'f1')).toBe(true);
  });

  test('an empty xref target is skipped', () => {
    expect(extractReferences('f', 'a <<>> b\n').filter((reference) => reference.kind === 'xref')).toHaveLength(0);
  });

  test('a reference range spans the matched text', () => {
    const [reference] = extractReferences('f', '<<intro>>');
    expect(reference.range).toEqual({ from: 0, to: '<<intro>>'.length });
  });
});

describe('extractSymbols', () => {
  test('extracts section, anchor (all three forms), and attribute definitions', () => {
    const content = [
      '== A Section',
      '[[anchor-one]]',
      '[#anchor-two]',
      'anchor:anchor-three[]',
      ':myattr: value',
    ].join('\n');
    const symbols = extractSymbols('f', content);
    const named = symbols.map((symbol) => `${symbol.kind}:${symbol.name}`);
    expect(named).toContain('section:_a_section');
    expect(named).toContain('anchor:anchor-one');
    expect(named).toContain('anchor:anchor-two');
    expect(named).toContain('anchor:anchor-three');
    expect(named).toContain('attribute:myattr');
  });

  test('an unset attribute (:attr!:) is not treated as a definition', () => {
    const symbols = extractSymbols('f', ':draft!:\n');
    expect(symbols.filter((symbol) => symbol.kind === 'attribute')).toHaveLength(0);
  });
});

describe('resolveReference', () => {
  const symbols: ProjectSymbol[] = [
    { kind: 'anchor', name: 'intro', fileId: 'f', range: { from: 0, to: 1 } },
    { kind: 'section', name: '_part', fileId: 'f', range: { from: 0, to: 1 } },
    { kind: 'attribute', name: 'Version', fileId: 'f', range: { from: 0, to: 1 } },
  ];

  test('resolves a bare xref to an anchor or section', () => {
    const reference: Reference = { kind: 'xref', target: 'intro', fileId: 'f', range: { from: 0, to: 1 } };
    expect(resolveReference(reference, symbols)).toMatchObject({ name: 'intro' });
  });

  test('resolves a cross-file xref by its #fragment', () => {
    const reference: Reference = { kind: 'xref', target: 'other.adoc#_part', fileId: 'f', range: { from: 0, to: 1 } };
    expect(resolveReference(reference, symbols)).toMatchObject({ name: '_part' });
  });

  test('resolves an attribute reference case-insensitively', () => {
    const reference: Reference = { kind: 'attributeRef', target: 'version', fileId: 'f', range: { from: 0, to: 1 } };
    expect(resolveReference(reference, symbols)).toMatchObject({ name: 'Version' });
  });

  test('returns "unresolved" for an unknown target or a non-resolvable kind', () => {
    const missing: Reference = { kind: 'xref', target: 'nope', fileId: 'f', range: { from: 0, to: 1 } };
    const include: Reference = { kind: 'include', target: 'x.adoc', fileId: 'f', range: { from: 0, to: 1 } };
    expect(resolveReference(missing, symbols)).toBe('unresolved');
    expect(resolveReference(include, symbols)).toBe('unresolved');
  });
});

describe('buildIncludeGraph', () => {
  const files: Record<string, string> = {
    root: 'include::a.adoc[leveloffset=+1]\ninclude::missing.adoc[]',
    a: 'include::b.adoc[]\ninclude::a.adoc[]', // self-include is cycle-guarded
    b: 'no includes here',
  };
  const readContent = (id: string): string | null => files[id] ?? null;
  const resolveInclude = (_from: string, target: string): string | null => {
    const map: Record<string, string> = { 'a.adoc': 'a', 'b.adoc': 'b' };
    return map[target] ?? null;
  };

  test('builds nodes/edges transitively, records unresolved, and carries leveloffset', () => {
    const tree = buildIncludeGraph('root', readContent, resolveInclude);
    expect(tree.rootFileId).toBe('root');
    expect(tree.nodes).toEqual(['root', 'a', 'b']);
    expect(tree.unresolved).toEqual([
      { fromFile: 'root', target: 'missing.adoc', range: expect.any(Object) },
    ]);
    const rootToA = tree.edges.find((edge) => edge.from === 'root' && edge.to === 'a');
    expect(rootToA?.leveloffset).toBe(1);
  });

  test('a file whose content is unavailable contributes a node but no edges', () => {
    const tree = buildIncludeGraph('ghost', () => null, resolveInclude);
    expect(tree.nodes).toEqual(['ghost']);
    expect(tree.edges).toHaveLength(0);
  });
});

describe('inheritedLevelOffset', () => {
  test('is 0 for the root file', () => {
    const tree = buildIncludeGraph('root', () => '', () => null);
    expect(inheritedLevelOffset(tree, 'root')).toBe(0);
  });

  test('sums edge offsets along the path from the root', () => {
    const tree = {
      rootFileId: 'r',
      nodes: ['r', 'a', 'b'],
      edges: [
        { from: 'r', to: 'a', includeDirectiveRange: { from: 0, to: 1 }, leveloffset: 1 },
        { from: 'a', to: 'b', includeDirectiveRange: { from: 0, to: 1 }, leveloffset: 2 },
      ],
      unresolved: [],
    };
    expect(inheritedLevelOffset(tree, 'b')).toBe(3);
  });

  test('returns 0 for a file unreachable from the root', () => {
    const tree = { rootFileId: 'r', nodes: ['r', 'x'], edges: [], unresolved: [] };
    expect(inheritedLevelOffset(tree, 'x')).toBe(0);
  });
});
