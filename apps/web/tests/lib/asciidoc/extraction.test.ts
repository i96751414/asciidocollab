import {
  headingToId,
  parseIncludeLevelOffset,
  extractReferences,
  extractSymbols,
  extractAttributeDefinitions,
  resolveReference,
  buildIncludeGraph,
  buildIncludeGraphWithInheritance,
  inheritedLevelOffset,
} from '@/lib/asciidoc/extraction';
import { resolveSandboxedPath } from '@/lib/asciidoc/sandbox-path';
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

  test('an explicit id above a heading overrides the section auto-id', () => {
    for (const anchor of ['[#install-guide]', '[[install-guide]]']) {
      const symbols = extractSymbols('f', `${anchor}\n====== Install\n`);
      const named = symbols.map((symbol) => `${symbol.kind}:${symbol.name}`);
      expect(named).toContain('section:install-guide'); // heading takes the explicit id
      expect(named).not.toContain('section:_install'); // the auto-id is suppressed
      expect(named).toContain('anchor:install-guide'); // the anchor itself remains (rename keys off it)
    }
  });

  test('two headings with the same text but distinct explicit ids are not duplicates', () => {
    const symbols = extractSymbols('f', '====== Dup\n\n[#install-guide]\n====== Dup\n');
    const sections = symbols.filter((symbol) => symbol.kind === 'section').map((symbol) => symbol.name);
    expect(sections).toEqual(['_dup', 'install-guide']);
  });
});

describe('extractAttributeDefinitions', () => {
  test('captures name→value pairs, downcased, skipping unset definitions', () => {
    const defs = extractAttributeDefinitions(':PartsDir: shared/parts\n:empty:\n:draft!:\nbody\n');
    expect(defs).toEqual([
      { name: 'partsdir', value: 'shared/parts' },
      { name: 'empty', value: '' },
    ]);
  });
});

const resolveInclude = (files: Record<string, string>) => (from: string, target: string) => {
  const resolved = resolveSandboxedPath(from, target);
  return resolved.ok && files[resolved.path] !== undefined ? resolved.path : null;
};

describe('buildIncludeGraph attribute substitution', () => {
  test('resolves an include whose target uses an attribute reference', () => {
    const files = {
      'main.adoc': ':partsdir: parts\n\ninclude::{partsdir}/intro.adoc[]\n',
      'parts/intro.adoc': '== Intro\n',
    };
    const tree = buildIncludeGraph('main.adoc', (id) => files[id] ?? null, resolveInclude(files));
    expect(tree.nodes).toContain('parts/intro.adoc');
    expect(tree.unresolved).toHaveLength(0);
  });

  test('reports the raw target when the attribute is undefined', () => {
    const files = { 'main.adoc': 'include::{missing}/intro.adoc[]\n' };
    const tree = buildIncludeGraph('main.adoc', (id) => files[id] ?? null, resolveInclude(files));
    expect(tree.unresolved).toEqual([
      expect.objectContaining({ fromFile: 'main.adoc', target: '{missing}/intro.adoc' }),
    ]);
  });

  test('an include is not resolved by an attribute defined after it (document order)', () => {
    const files = {
      'main.adoc': 'include::{dir}/x.adoc[]\n\n:dir: parts\n',
      'parts/x.adoc': '= X\n',
    };
    const tree = buildIncludeGraph('main.adoc', (id) => files[id] ?? null, resolveInclude(files));
    expect(tree.unresolved.some((u) => u.target === '{dir}/x.adoc')).toBe(true);
    expect(tree.nodes).not.toContain('parts/x.adoc');
  });
});

describe('buildIncludeGraphWithInheritance (parent → child attribute scope)', () => {
  test('a child inherits parent attributes defined above its include, not below', () => {
    const files = {
      'main.adoc': ':before: B\n\ninclude::child.adoc[]\n\n:after: A\n',
      'child.adoc': '= Child\n',
    };
    const { inheritedAttributes } = buildIncludeGraphWithInheritance(
      'main.adoc',
      (id) => files[id] ?? null,
      resolveInclude(files),
    );
    const inherited = inheritedAttributes.get('child.adoc');
    expect(inherited?.get('before')).toBe('B');
    expect(inherited?.has('after')).toBe(false);
    // The root inherits nothing from anyone.
    expect(inheritedAttributes.get('main.adoc')?.size).toBe(0);
  });

  test('a child inherits the parent :imagesdir: defined above the include', () => {
    const files = {
      'main.adoc': ':imagesdir: assets\n\ninclude::child.adoc[]\n',
      'child.adoc': 'image::logo.png[]\n',
    };
    const { inheritedAttributes } = buildIncludeGraphWithInheritance(
      'main.adoc',
      (id) => files[id] ?? null,
      resolveInclude(files),
    );
    expect(inheritedAttributes.get('child.adoc')?.get('imagesdir')).toBe('assets');
  });

  test('a recursive include (a → b → a) terminates and records first-visit inheritance', () => {
    const files = {
      'a.adoc': ':froma: 1\n\ninclude::b.adoc[]\n',
      'b.adoc': ':fromb: 2\n\ninclude::a.adoc[]\n',
    };
    const { tree, inheritedAttributes } = buildIncludeGraphWithInheritance(
      'a.adoc',
      (id) => files[id] ?? null,
      resolveInclude(files),
    );
    expect(tree.nodes).toEqual(['a.adoc', 'b.adoc']); // cycle guarded, no infinite loop
    expect(inheritedAttributes.get('a.adoc')?.size).toBe(0); // root, first visit
    expect(inheritedAttributes.get('b.adoc')?.get('froma')).toBe('1');
  });

  test('buildIncludeGraph returns just the tree of the inheritance-aware walk', () => {
    const files = { 'main.adoc': ':x: 1\ninclude::child.adoc[]\n', 'child.adoc': '= Child\n' };
    const tree = buildIncludeGraph('main.adoc', (id) => files[id] ?? null, resolveInclude(files));
    const result = buildIncludeGraphWithInheritance('main.adoc', (id) => files[id] ?? null, resolveInclude(files));
    expect(tree).toEqual(result.tree);
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
