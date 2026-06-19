import {
  headingToId,
  parseIncludeLevelOffset,
  extractReferences,
  extractSymbols,
  extractAttributeDefinitions,
  extractOwnAttributes,
  resolveReference,
  buildIncludeGraph,
  buildIncludeGraphWithInheritance,
  inheritedLevelOffset,
  resolveAttributeScope,
  effectiveLevelOffset,
} from '@/lib/asciidoc/extraction';
import { resolveSandboxedPath } from '@/lib/asciidoc/sandbox-path';
import type { ProjectSymbol, Reference } from '@asciidocollab/shared';

/** An in-memory `readContent` fake: maps a file id to its content, or null when absent. */
const read = (files: Record<string, string>) => (id: string) => files[id] ?? null;

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

  test('ignores references inside verbatim/code/comment blocks (no false positives)', () => {
    const content = [
      'Real <<intro>> here.',
      '',
      '[source,ruby]',
      '----',
      'puts "<<notreal>> {undefinedAttr}"',
      'image::not-a-real-image.png[]',
      '----',
      '',
      '....',
      'literal <<alsonotreal>>',
      '....',
      '',
      '++++',
      'passthrough {ptattr}',
      '++++',
      '',
      '////',
      'comment <<commentxref>> include::ghost.adoc[]',
      '////',
      '',
      '// line comment <<linexref>>',
    ].join('\n');
    const targets = extractReferences('f', content).map((reference) => reference.target);
    expect(targets).toContain('intro');
    expect(targets).not.toContain('notreal');
    expect(targets).not.toContain('undefinedAttr');
    expect(targets).not.toContain('not-a-real-image.png');
    expect(targets).not.toContain('alsonotreal');
    expect(targets).not.toContain('ptattr');
    expect(targets).not.toContain('commentxref');
    expect(targets).not.toContain('ghost.adoc');
    expect(targets).not.toContain('linexref');
  });

  test('references inside non-verbatim delimited blocks (example/sidebar/quote) are still extracted', () => {
    // Example/sidebar/quote blocks get normal substitutions, so references inside them are real.
    const content = '====\nSee <<inExample>>\n====\n\n****\n<<inSidebar>>\n****';
    const targets = extractReferences('f', content).map((reference) => reference.target);
    expect(targets).toContain('inExample');
    expect(targets).toContain('inSidebar');
  });

  test('an INDENTED `----` is block content, not a fence — references after it are still extracted', () => {
    // Asciidoctor delimited-block fences must start at column 0; an indented run is ordinary content.
    // Treating it as a fence would mask every reference to end-of-document (unterminated-block).
    const content = 'A list:\n\n* item\n  ----\n  not a fence\n\nReal <<keep>> reference.\n';
    const targets = extractReferences('f', content).map((reference) => reference.target);
    expect(targets).toContain('keep');
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

  test('a `{set:}` that is value text of an attribute definition is not a phantom attribute symbol (#4)', () => {
    const named = extractSymbols('f', ':greeting: hi {set:secret:x}\n').map((s) => `${s.kind}:${s.name}`);
    expect(named).toContain('attribute:greeting'); // the real `:greeting:` definition
    expect(named).not.toContain('attribute:secret'); // the `{set:}` inside its value is not separate
  });

  test('an inline `{set:}` on a prose line is still a first-class attribute symbol', () => {
    const named = extractSymbols('f', 'body {set:flag:on}\n').map((s) => `${s.kind}:${s.name}`);
    expect(named).toContain('attribute:flag');
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

  test('a heading glued under prose is paragraph text, not a section (matches the domain copy)', () => {
    expect(extractSymbols('f', 'Some prose text\n== Section Foo\n').filter((s) => s.kind === 'section')).toHaveLength(0);
  });

  test('a heading after a closed delimited block (no blank line) is still a section', () => {
    const named = extractSymbols('f', '****\nSidebar\n****\n== Section Foo\n').map((s) => `${s.kind}:${s.name}`);
    expect(named).toContain('section:_section_foo');
  });

  test('ignores symbols (anchors/attrs/headings) inside verbatim/comment blocks', () => {
    const content = [
      '[[real-anchor]]',
      '----',
      '[[fake-anchor]]',
      ':fakeattr: x',
      '== Fake Heading',
      '----',
      '////',
      'anchor:commentanchor[]',
      '////',
    ].join('\n');
    const named = extractSymbols('f', content).map((symbol) => `${symbol.kind}:${symbol.name}`);
    expect(named).toContain('anchor:real-anchor');
    expect(named).not.toContain('anchor:fake-anchor');
    expect(named).not.toContain('attribute:fakeattr');
    expect(named).not.toContain('section:_fake_heading');
    expect(named).not.toContain('anchor:commentanchor');
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

describe('extractOwnAttributes', () => {
  test('captures `:name: value` entries downcased, skipping unset definitions', () => {
    const own = extractOwnAttributes(':PartsDir: shared/parts\n:empty:\n:draft!:\nbody\n');
    expect(Object.fromEntries(own)).toEqual({ partsdir: 'shared/parts', empty: '' });
  });

  test('includes an inline `{set:name:value}` assignment as a first-class own definition (FR-040)', () => {
    // The bug: a `{set:}`-defined attribute was not recognized in the editor because only `:name:`
    // entries were extracted. It must now be a first-class own attribute, like a `:name:` entry.
    const own = extractOwnAttributes('{set:basedir:src/main}\nbody\n');
    expect(own.get('basedir')).toBe('src/main');
  });

  test('an inline `{set:name!}` unset removes the attribute', () => {
    const own = extractOwnAttributes(':x: 1\n{set:x!}\n');
    expect(own.has('x')).toBe(false);
  });

  test('a later definition overrides an earlier one (document order)', () => {
    const own = extractOwnAttributes(':v: one\n{set:v:two}\n');
    expect(own.get('v')).toBe('two');
  });

  test('expands a nested `{ref}` in a set value against the attributes defined so far', () => {
    const own = extractOwnAttributes(':first: Jane\n:full: {first} Doe\n');
    expect(own.get('full')).toBe('Jane Doe');
  });

  test('does NOT treat attribute entries / inline {set:} inside a verbatim block as real definitions', () => {
    // A code sample documenting AsciiDoc syntax must not pollute the resolved scope. extractSymbols
    // already skips verbatim ranges; the resolution model must agree (consistency, finding #5).
    const content = [
      ':real: yes',
      '',
      '----',
      ':fake: nope',
      '{set:alsofake:nope}',
      '----',
      '',
    ].join('\n');
    const own = extractOwnAttributes(content);
    expect(own.get('real')).toBe('yes');
    expect(own.has('fake')).toBe(false);
    expect(own.has('alsofake')).toBe(false);
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

  test('a `\\`-continued attribute value containing an include:: line creates NO spurious include edge', () => {
    // The `include::child.adoc[]` line is the continuation of `:k:`'s wrapped value (FR-041), so it is
    // value TEXT — not a directive. The assembler already treats it that way; the graph must agree and
    // not synthesize an edge to child.adoc from text inside an attribute value.
    const files = {
      'main.adoc': ':k: a \\\ninclude::child.adoc[]\nBody {k}.\n',
      'child.adoc': '= Child\n',
    };
    const { tree } = buildIncludeGraphWithInheritance('main.adoc', (id) => files[id] ?? null, resolveInclude(files));
    expect(tree.edges.some((edge) => edge.to === 'child.adoc')).toBe(false);
  });

  test('resolves nested attribute references in inherited values (document order)', () => {
    const files = {
      'main.adoc': ':first: Jane\n:full: {first} Doe\n\ninclude::child.adoc[]\n',
      'child.adoc': '= Child\n',
    };
    const { inheritedAttributes } = buildIncludeGraphWithInheritance(
      'main.adoc',
      (id) => files[id] ?? null,
      resolveInclude(files),
    );
    expect(inheritedAttributes.get('child.adoc')?.get('full')).toBe('Jane Doe');
  });

  test('leaves a forward reference in an inherited value unresolved (document order)', () => {
    const files = {
      'main.adoc': ':full: {first} Doe\n:first: Jane\n\ninclude::child.adoc[]\n',
      'child.adoc': '= Child\n',
    };
    const { inheritedAttributes } = buildIncludeGraphWithInheritance(
      'main.adoc',
      (id) => files[id] ?? null,
      resolveInclude(files),
    );
    // `:full:` is defined before `:first:`, so the reference is not yet in scope — left verbatim.
    expect(inheritedAttributes.get('child.adoc')?.get('full')).toBe('{first} Doe');
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

  test('does NOT walk an include gated off by an inactive conditional region (matches the preview/effectiveLevelOffset)', () => {
    const files = {
      'main.adoc': 'ifdef::pdf[]\ninclude::child.adoc[]\nendif::[]\n',
      'child.adoc': ':childattr: x\n= Child\n',
    };
    const { tree, inheritedAttributes } = buildIncludeGraphWithInheritance(
      'main.adoc',
      (id) => files[id] ?? null,
      resolveInclude(files),
    );
    // `pdf` is undefined ⇒ the region is inactive ⇒ child is not part of the rendered document, so it
    // must not be a node/edge and must contribute no inherited scope.
    expect(tree.nodes).not.toContain('child.adoc');
    expect(tree.edges).toHaveLength(0);
    expect(inheritedAttributes.has('child.adoc')).toBe(false);
  });

  test('DOES walk an include gated ON by an active conditional region', () => {
    const files = {
      'main.adoc': ':pdf:\n\nifdef::pdf[]\ninclude::child.adoc[]\nendif::[]\n',
      'child.adoc': '= Child\n',
    };
    const { tree } = buildIncludeGraphWithInheritance('main.adoc', (id) => files[id] ?? null, resolveInclude(files));
    expect(tree.nodes).toContain('child.adoc');
  });

  test('gates includes against the render-intrinsic seed so an ifdef::backend-html5[] include is walked (preview parity)', () => {
    const files = {
      'main.adoc': 'ifdef::backend-html5[]\ninclude::child.adoc[]\nendif::[]\n',
      'child.adoc': '= Child\n',
    };
    // Without the seed, backend-html5 is undefined and the include would be (wrongly) gated off; seeding
    // the render intrinsics makes the inheritance walk gate it ON, exactly as the assembler/render do.
    const seed = new Map([['backend-html5', '']]);
    const gated = buildIncludeGraphWithInheritance('main.adoc', (id) => files[id] ?? null, resolveInclude(files));
    const seeded = buildIncludeGraphWithInheritance('main.adoc', (id) => files[id] ?? null, resolveInclude(files), seed);
    expect(gated.tree.nodes).not.toContain('child.adoc'); // no seed ⇒ gated off
    expect(seeded.tree.nodes).toContain('child.adoc'); // seeded ⇒ active, matching the preview
  });

  test('an include:: inside a verbatim block is literal text, creating NO edge', () => {
    const files = {
      'main.adoc': '----\ninclude::child.adoc[]\n----\n',
      'child.adoc': '= Child\n',
    };
    const { tree } = buildIncludeGraphWithInheritance('main.adoc', (id) => files[id] ?? null, resolveInclude(files));
    expect(tree.edges).toHaveLength(0);
    expect(tree.nodes).not.toContain('child.adoc');
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

describe('resolveAttributeScope', () => {
  test('standalone (rootFileId=null) resolves only the file\'s own attributes', () => {
    const files = { 'lone.adoc': ':own: yes\n:another: 2\nbody {own}\n' };
    const scope = resolveAttributeScope({
      rootFileId: null,
      fileId: 'lone.adoc',
      readContent: read(files),
      resolveInclude: resolveInclude(files),
    });
    expect(scope.origin).toBe('standalone');
    expect(scope.values.get('own')).toBe('yes');
    expect(scope.values.get('another')).toBe('2');
  });

  test('root scope (fileId === rootFileId) has origin "root" and its own attrs', () => {
    const files = { 'main.adoc': ':title: Manual\n\ninclude::child.adoc[]\n', 'child.adoc': '= Child\n' };
    const scope = resolveAttributeScope({
      rootFileId: 'main.adoc',
      fileId: 'main.adoc',
      readContent: read(files),
      resolveInclude: resolveInclude(files),
    });
    expect(scope.origin).toBe('root');
    expect(scope.values.get('title')).toBe('Manual');
  });

  test('a child inherits the parent attributes defined above its include, plus its own', () => {
    const files = {
      'main.adoc': ':env: prod\n\ninclude::child.adoc[]\n\n:after: late\n',
      'child.adoc': '= Child\n:local: x\n',
    };
    const scope = resolveAttributeScope({
      rootFileId: 'main.adoc',
      fileId: 'child.adoc',
      readContent: read(files),
      resolveInclude: resolveInclude(files),
    });
    expect(scope.origin).toBe('inherited');
    expect(scope.values.get('env')).toBe('prod'); // inherited from above the include
    expect(scope.values.has('after')).toBe(false); // defined after the include — not inherited
    expect(scope.values.get('local')).toBe('x'); // child's own definition applied on top
  });

  test('a `{set:}` that is value text of an attribute definition does not leak into the scope', () => {
    // `:greeting:`'s value happens to contain `{set:secret:x}`. In Asciidoctor that text is only an
    // assignment if/when `{greeting}` is rendered — it must NOT be counted as a document-order inline
    // set at definition time, so `secret` never enters the resolved scope (#4).
    const files = {
      'main.adoc': ':greeting: hi {set:secret:x}\n\ninclude::child.adoc[]\n',
      'child.adoc': '= Child\n',
    };
    const scope = resolveAttributeScope({
      rootFileId: 'main.adoc',
      fileId: 'child.adoc',
      readContent: read(files),
      resolveInclude: resolveInclude(files),
    });
    expect(scope.values.get('greeting')).toBe('hi {set:secret:x}'); // the set text is kept as value
    expect(scope.values.has('secret')).toBe(false); // but it is NOT a separate inline-set
  });

  test('first-include inheritance: a child reached via two paths keeps its FIRST-visit scope', () => {
    const files = {
      'main.adoc': ':flag: one\n\ninclude::child.adoc[]\n\n:flag: two\n\ninclude::child.adoc[]\n',
      'child.adoc': 'uses {flag}\n',
    };
    const scope = resolveAttributeScope({
      rootFileId: 'main.adoc',
      fileId: 'child.adoc',
      readContent: read(files),
      resolveInclude: resolveInclude(files),
    });
    expect(scope.values.get('flag')).toBe('one'); // first visit wins
  });

  test('unset (:!name:) before an include removes the attribute for the child', () => {
    const files = {
      'main.adoc': ':env: prod\n:!env:\n\ninclude::child.adoc[]\n',
      'child.adoc': '= Child\n',
    };
    const scope = resolveAttributeScope({
      rootFileId: 'main.adoc',
      fileId: 'child.adoc',
      readContent: read(files),
      resolveInclude: resolveInclude(files),
    });
    expect(scope.values.has('env')).toBe(false);
  });

  test('inline {set:name:value} sets, and {set:name!} unsets, in reading order', () => {
    const files = {
      'main.adoc': '{set:dyn:on}\n\ninclude::child.adoc[]\n',
      'child.adoc': '= Child\n',
    };
    const scope = resolveAttributeScope({
      rootFileId: 'main.adoc',
      fileId: 'child.adoc',
      readContent: read(files),
      resolveInclude: resolveInclude(files),
    });
    expect(scope.values.get('dyn')).toBe('on');

    const unsetFiles = {
      'main.adoc': ':dyn: on\n{set:dyn!}\n\ninclude::child.adoc[]\n',
      'child.adoc': '= Child\n',
    };
    const unsetScope = resolveAttributeScope({
      rootFileId: 'main.adoc',
      fileId: 'child.adoc',
      readContent: read(unsetFiles),
      resolveInclude: resolveInclude(unsetFiles),
    });
    expect(unsetScope.values.has('dyn')).toBe(false);
  });

  test(String.raw`wrapping (trailing \) joins a multi-line attribute value`, () => {
    const files = { 'lone.adoc': ':msg: first line \\\nsecond line\n' };
    const scope = resolveAttributeScope({
      rootFileId: null,
      fileId: 'lone.adoc',
      readContent: read(files),
      resolveInclude: resolveInclude(files),
    });
    expect(scope.values.get('msg')).toBe('first line second line');
  });

  test('a soft-set (value@) does not override an attribute already in scope; a later hard set does', () => {
    // Soft default: set only if not already defined (Asciidoctor `@` precedence marker).
    const files = {
      'lone.adoc': ':theme: dark\n:theme: light@\n:other: a@\n',
    };
    const scope = resolveAttributeScope({
      rootFileId: null,
      fileId: 'lone.adoc',
      readContent: read(files),
      resolveInclude: resolveInclude(files),
    });
    expect(scope.values.get('theme')).toBe('dark'); // soft set did not override the existing value
    expect(scope.values.get('other')).toBe('a'); // soft set of an unset attr applies, marker stripped
  });

  test('a later in-document definition is NOT applied over a soft default for the same name', () => {
    const files = { 'lone.adoc': ':v: locked\n:v: open@\n' };
    const scope = resolveAttributeScope({
      rootFileId: null,
      fileId: 'lone.adoc',
      readContent: read(files),
      resolveInclude: resolveInclude(files),
    });
    expect(scope.values.get('v')).toBe('locked');
  });

  test('a recursive include (a -> b -> a) terminates safely', () => {
    const files = {
      'a.adoc': ':x: 1\n\ninclude::b.adoc[]\n',
      'b.adoc': ':y: 2\n\ninclude::a.adoc[]\n',
    };
    const scope = resolveAttributeScope({
      rootFileId: 'a.adoc',
      fileId: 'b.adoc',
      readContent: read(files),
      resolveInclude: resolveInclude(files),
    });
    expect(scope.values.get('x')).toBe('1');
  });

  test('a file unreachable from the root inherits nothing but keeps its own attributes', () => {
    const files = { 'main.adoc': '= Main\n', 'orphan.adoc': ':o: 1\n' };
    const scope = resolveAttributeScope({
      rootFileId: 'main.adoc',
      fileId: 'orphan.adoc',
      readContent: read(files),
      resolveInclude: resolveInclude(files),
    });
    expect(scope.origin).toBe('inherited');
    expect(scope.values.get('o')).toBe('1'); // own definition; no inherited context
    expect(scope.values.size).toBe(1);
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

describe('effectiveLevelOffset (attribute-form :leveloffset: + include offsets, include-scoped)', () => {
  test('standalone (rootFileId=null) is 0 — the file has no inherited offset', () => {
    const files = { 'lone.adoc': ':leveloffset: +1\n\n== A\n' };
    expect(
      effectiveLevelOffset({
        rootFileId: null,
        fileId: 'lone.adoc',
        readContent: read(files),
        resolveInclude: resolveInclude(files),
      }),
    ).toBe(0);
  });

  test('the root file itself has 0 inherited offset', () => {
    const files = { 'main.adoc': ':leveloffset: +2\n\ninclude::child.adoc[]\n', 'child.adoc': '== C\n' };
    expect(
      effectiveLevelOffset({
        rootFileId: 'main.adoc',
        fileId: 'main.adoc',
        readContent: read(files),
        resolveInclude: resolveInclude(files),
      }),
    ).toBe(0);
  });

  test('a child included with leveloffset=+1 inherits offset +1', () => {
    const files = {
      'main.adoc': 'include::child.adoc[leveloffset=+1]\n',
      'child.adoc': '= Child Title\n',
    };
    expect(
      effectiveLevelOffset({
        rootFileId: 'main.adoc',
        fileId: 'child.adoc',
        readContent: read(files),
        resolveInclude: resolveInclude(files),
      }),
    ).toBe(1);
  });

  test('a parent attribute-form :leveloffset: above the include is inherited by the child', () => {
    const files = {
      'main.adoc': ':leveloffset: +2\n\ninclude::child.adoc[]\n',
      'child.adoc': '== Heading\n',
    };
    expect(
      effectiveLevelOffset({
        rootFileId: 'main.adoc',
        fileId: 'child.adoc',
        readContent: read(files),
        resolveInclude: resolveInclude(files),
      }),
    ).toBe(2);
  });

  test('attribute-form and include-option offsets compose at the include point', () => {
    const files = {
      'main.adoc': ':leveloffset: +1\n\ninclude::child.adoc[leveloffset=+2]\n',
      'child.adoc': '== Heading\n',
    };
    expect(
      effectiveLevelOffset({
        rootFileId: 'main.adoc',
        fileId: 'child.adoc',
        readContent: read(files),
        resolveInclude: resolveInclude(files),
      }),
    ).toBe(3); // parent attribute +1 plus the include option +2
  });

  test('a parent attribute-form :leveloffset: AFTER the include does not reach the child', () => {
    const files = {
      'main.adoc': 'include::child.adoc[]\n\n:leveloffset: +5\n',
      'child.adoc': '== Heading\n',
    };
    expect(
      effectiveLevelOffset({
        rootFileId: 'main.adoc',
        fileId: 'child.adoc',
        readContent: read(files),
        resolveInclude: resolveInclude(files),
      }),
    ).toBe(0);
  });

  test('include-scoped restoration: an unbalanced :leveloffset: inside one child does not leak into a sibling', () => {
    // first.adoc raises the offset by +1 and never resets it; that change is scoped to the include,
    // so second.adoc (included after, with no offset) inherits offset 0, not +1.
    const files = {
      'main.adoc': 'include::first.adoc[]\n\ninclude::second.adoc[]\n',
      'first.adoc': ':leveloffset: +1\n\n== In First\n',
      'second.adoc': '== In Second\n',
    };
    expect(
      effectiveLevelOffset({
        rootFileId: 'main.adoc',
        fileId: 'second.adoc',
        readContent: read(files),
        resolveInclude: resolveInclude(files),
      }),
    ).toBe(0);
  });

  test('first-include-point wins for a child reached via two paths', () => {
    const files = {
      'main.adoc': 'include::child.adoc[leveloffset=+1]\n\ninclude::child.adoc[leveloffset=+3]\n',
      'child.adoc': '== Heading\n',
    };
    expect(
      effectiveLevelOffset({
        rootFileId: 'main.adoc',
        fileId: 'child.adoc',
        readContent: read(files),
        resolveInclude: resolveInclude(files),
      }),
    ).toBe(1); // first visit (leveloffset=+1) wins
  });

  test('a recursive include (a -> b -> a) terminates safely', () => {
    const files = {
      'a.adoc': 'include::b.adoc[leveloffset=+1]\n',
      'b.adoc': 'include::a.adoc[leveloffset=+1]\n',
    };
    expect(
      effectiveLevelOffset({
        rootFileId: 'a.adoc',
        fileId: 'b.adoc',
        readContent: read(files),
        resolveInclude: resolveInclude(files),
      }),
    ).toBe(1);
  });

  test('a file unreachable from the root has 0 inherited offset', () => {
    const files = { 'main.adoc': '= Main\n', 'orphan.adoc': ':leveloffset: +4\n\n== O\n' };
    expect(
      effectiveLevelOffset({
        rootFileId: 'main.adoc',
        fileId: 'orphan.adoc',
        readContent: read(files),
        resolveInclude: resolveInclude(files),
      }),
    ).toBe(0);
  });

  test('an include inside an INACTIVE conditional branch is not walked (no inherited offset)', () => {
    // `draft` is never set, so the `ifdef::draft[]` region is inactive — the preview never expands
    // this include, so the child must not inherit the include's offset either (#3).
    const files = {
      'main.adoc': 'ifdef::draft[]\ninclude::child.adoc[leveloffset=+2]\nendif::[]\n',
      'child.adoc': '== Heading\n',
    };
    expect(
      effectiveLevelOffset({
        rootFileId: 'main.adoc',
        fileId: 'child.adoc',
        readContent: read(files),
        resolveInclude: resolveInclude(files),
      }),
    ).toBe(0);
  });

  test('an include inside an ACTIVE conditional branch is walked normally', () => {
    const files = {
      'main.adoc': ':draft:\n\nifdef::draft[]\ninclude::child.adoc[leveloffset=+2]\nendif::[]\n',
      'child.adoc': '== Heading\n',
    };
    expect(
      effectiveLevelOffset({
        rootFileId: 'main.adoc',
        fileId: 'child.adoc',
        readContent: read(files),
        resolveInclude: resolveInclude(files),
      }),
    ).toBe(2);
  });

  test('an `include::` with trailing text after `]` is not a directive (matches Asciidoctor/assembler)', () => {
    // Asciidoctor requires an include directive to occupy the whole line; `include::x[] trailing` is a
    // paragraph, so it is never expanded and contributes no offset — the offset walk must agree with the
    // assembler here, not synthesize a phantom include.
    const files = {
      'main.adoc': 'include::child.adoc[leveloffset=+2]  trailing text\n',
      'child.adoc': '== Heading\n',
    };
    expect(
      effectiveLevelOffset({
        rootFileId: 'main.adoc',
        fileId: 'child.adoc',
        readContent: read(files),
        resolveInclude: resolveInclude(files),
      }),
    ).toBe(0);
  });

  test('a `\\`-continued attribute value whose continuation line looks like an include is NOT walked', () => {
    // `:caption:` wraps onto a second physical line that happens to read `include::child.adoc[...]`.
    // That line is value TEXT, not a directive — documentOrderEvents and the assembler both join it,
    // so effectiveLevelOffset must too, or it synthesizes a phantom include/offset for child.adoc (#3).
    const files = {
      'main.adoc': ':caption: see \\\ninclude::child.adoc[leveloffset=+3]\n',
      'child.adoc': '== Heading\n',
    };
    expect(
      effectiveLevelOffset({
        rootFileId: 'main.adoc',
        fileId: 'child.adoc',
        readContent: read(files),
        resolveInclude: resolveInclude(files),
      }),
    ).toBe(0); // child.adoc is unreachable — the only `include::` is value text of a wrapped attribute
  });

  test('seedAttributes make an intrinsic-guarded include active (matches the seeded preview)', () => {
    // With `backend-html5` seeded (as the worker seeds the assembler), an `ifdef::backend-html5[]`
    // include is active and IS walked — the editor's inherited offset agrees with the preview (#1/#3).
    const files = {
      'main.adoc': 'ifdef::backend-html5[]\ninclude::child.adoc[leveloffset=+1]\nendif::[]\n',
      'child.adoc': '== Heading\n',
    };
    expect(
      effectiveLevelOffset({
        rootFileId: 'main.adoc',
        fileId: 'child.adoc',
        readContent: read(files),
        resolveInclude: resolveInclude(files),
        seedAttributes: new Map([['backend-html5', '']]),
      }),
    ).toBe(1);
    // Without the seed the branch is inactive, so the include is not walked (offset 0).
    expect(
      effectiveLevelOffset({
        rootFileId: 'main.adoc',
        fileId: 'child.adoc',
        readContent: read(files),
        resolveInclude: resolveInclude(files),
      }),
    ).toBe(0);
  });
});
