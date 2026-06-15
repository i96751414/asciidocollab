import {
  extractReferences,
  extractSymbols,
  extractAttributeDefinitions,
  resolveReference,
  buildIncludeGraph,
  inheritedLevelOffset,
  headingToId,
  parseIncludeLevelOffset,
} from '../../src/services/asciidoc-extraction';
import { resolveSandboxedPath } from '../../src/value-objects/files/sandboxed-path';

describe('extractReferences (FR-046/065)', () => {
  test('extracts xref, include, image, and attributeRef', () => {
    const content = 'See <<intro>> and xref:other[].\ninclude::part.adoc[]\nimage::pic.png[]\nVersion {ver}.\n';
    const kinds = extractReferences('f1', content).map((r) => `${r.kind}:${r.target}`);
    expect(kinds).toContain('xref:intro');
    expect(kinds).toContain('xref:other');
    expect(kinds).toContain('include:part.adoc');
    expect(kinds).toContain('image:pic.png');
    expect(kinds).toContain('attributeRef:ver');
  });

  test('reference ranges map back to the source text', () => {
    const content = 'x <<a>> y';
    const [reference] = extractReferences('f1', content);
    expect(content.slice(reference.range.from, reference.range.to)).toBe('<<a>>');
  });

  test('ignores references inside verbatim/comment blocks (so rename/find-references skip code samples)', () => {
    const content = [
      'Real <<intro>>.',
      '----',
      'puts "<<notreal>> {undefinedAttr}"',
      'image::not-real.png[]',
      '----',
      '////',
      'comment <<commentxref>> include::ghost.adoc[]',
      '////',
      '// line <<linexref>>',
    ].join('\n');
    const targets = extractReferences('f1', content).map((r) => r.target);
    expect(targets).toContain('intro');
    expect(targets).not.toContain('notreal');
    expect(targets).not.toContain('undefinedAttr');
    expect(targets).not.toContain('not-real.png');
    expect(targets).not.toContain('commentxref');
    expect(targets).not.toContain('ghost.adoc');
    expect(targets).not.toContain('linexref');
  });

  test('references inside non-verbatim delimited blocks (example/sidebar) are still real', () => {
    const targets = extractReferences('f1', '====\n<<inExample>>\n====').map((r) => r.target);
    expect(targets).toContain('inExample');
  });

  test('an INDENTED fence is content, not a delimiter — references after it are not dropped from rename/find', () => {
    // A column-0 requirement matters here: the domain extractor backs find-references and rename, so
    // over-masking would silently leave references un-rewritten and dangling after a rename.
    const targets = extractReferences('f1', '* item\n  ----\n  x\n\nReal <<keep>>.\n').map((r) => r.target);
    expect(targets).toContain('keep');
  });
});

describe('extractSymbols (FR-061)', () => {
  test('extracts sections (auto-id), anchors, and attributes', () => {
    const content = '== My Section\n\n[[anchor-one]]\nText.\n\n:author: Jane\n';
    const symbols = extractSymbols('f1', content);
    expect(symbols).toContainEqual(expect.objectContaining({ kind: 'section', name: '_my_section' }));
    expect(symbols).toContainEqual(expect.objectContaining({ kind: 'anchor', name: 'anchor-one' }));
    expect(symbols).toContainEqual(expect.objectContaining({ kind: 'attribute', name: 'author' }));
  });

  test('an unset attribute (:name!:) is not a definition', () => {
    expect(extractSymbols('f1', ':toc!:\n').filter((s) => s.kind === 'attribute')).toHaveLength(0);
  });

  test('an explicit id above a heading overrides the section auto-id (anchor itself remains)', () => {
    const symbols = extractSymbols('f1', '[#install-guide]\n====== Install\n');
    expect(symbols).toContainEqual(expect.objectContaining({ kind: 'section', name: 'install-guide' }));
    expect(symbols.some((s) => s.name === '_install')).toBe(false);
    expect(symbols.some((s) => s.kind === 'anchor' && s.name === 'install-guide')).toBe(true);
  });

  test('same-text headings with distinct explicit ids yield distinct section ids', () => {
    const symbols = extractSymbols('f1', '====== Dup\n\n[#install-guide]\n====== Dup\n');
    expect(symbols.filter((s) => s.kind === 'section').map((s) => s.name)).toEqual(['_dup', 'install-guide']);
  });

  test('a heading glued under prose is paragraph text, not a section (block-boundary rule)', () => {
    const symbols = extractSymbols('f1', 'Some prose text\n== Section Foo\n');
    expect(symbols.filter((s) => s.kind === 'section')).toHaveLength(0);
  });

  test('a heading after a closed delimited block (no blank line) is still a section', () => {
    const symbols = extractSymbols('f1', '****\nSidebar block\n****\n== Section Foo\n');
    expect(symbols).toContainEqual(expect.objectContaining({ kind: 'section', name: '_section_foo' }));
  });

  test('headings inside a verbatim block are not sections, but the one after is', () => {
    const symbols = extractSymbols('f1', '== Real\n\n----\n== Not a heading\n----\n\n== Also Real\n');
    expect(symbols.filter((s) => s.kind === 'section').map((s) => s.name)).toEqual(['_real', '_also_real']);
  });

  test('anchors and attribute definitions inside verbatim/comment blocks are not symbols', () => {
    const content = [
      '[[real-anchor]]',
      '----',
      '[[fake-anchor]]',
      ':fakeattr: x',
      '----',
      '////',
      'anchor:commentanchor[]',
      '////',
    ].join('\n');
    const named = extractSymbols('f1', content).map((s) => `${s.kind}:${s.name}`);
    expect(named).toContain('anchor:real-anchor');
    expect(named).not.toContain('anchor:fake-anchor');
    expect(named).not.toContain('attribute:fakeattr');
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

  test('reports the raw (unsubstituted) target when an attribute is undefined', () => {
    const files = { 'main.adoc': 'include::{missing}/intro.adoc[]\n' };
    const tree = buildIncludeGraph('main.adoc', (id) => files[id] ?? null, resolveInclude(files));
    expect(tree.unresolved).toEqual([
      expect.objectContaining({ fromFile: 'main.adoc', target: '{missing}/intro.adoc' }),
    ]);
  });

  test('resolves an include whose target uses a nested attribute reference', () => {
    const files = {
      'main.adoc': ':root: parts\n:dir: {root}/sub\n\ninclude::{dir}/intro.adoc[]\n',
      'parts/sub/intro.adoc': '== Intro\n',
    };
    const tree = buildIncludeGraph('main.adoc', (id) => files[id] ?? null, resolveInclude(files));
    expect(tree.nodes).toContain('parts/sub/intro.adoc');
    expect(tree.unresolved).toHaveLength(0);
  });

  test('does not substitute an attribute defined after the include (document order)', () => {
    const files = {
      'main.adoc': 'include::{partsdir}/intro.adoc[]\n\n:partsdir: parts\n',
      'parts/intro.adoc': '== Intro\n',
    };
    const tree = buildIncludeGraph('main.adoc', (id) => files[id] ?? null, resolveInclude(files));
    expect(tree.nodes).not.toContain('parts/intro.adoc');
    expect(tree.unresolved.some((u) => u.target === '{partsdir}/intro.adoc')).toBe(true);
  });
});

describe('headingToId / parseIncludeLevelOffset', () => {
  test('auto-id mirrors Asciidoctor', () => {
    expect(headingToId('Getting Started!')).toBe('_getting_started');
  });
  test('parses include leveloffset', () => {
    expect(parseIncludeLevelOffset('leveloffset=+2')).toBe(2);
    expect(parseIncludeLevelOffset('leveloffset=-1')).toBe(-1);
    expect(parseIncludeLevelOffset('')).toBe(0);
  });
});

describe('resolveReference', () => {
  const symbols = extractSymbols('f1', '[[intro]]\n:ver: 1\n');
  test('resolves a known xref / attributeRef', () => {
    expect(resolveReference({ kind: 'xref', target: 'intro', fileId: 'f1', range: { from: 0, to: 0 } }, symbols)).not.toBe('unresolved');
    expect(resolveReference({ kind: 'attributeRef', target: 'ver', fileId: 'f1', range: { from: 0, to: 0 } }, symbols)).not.toBe('unresolved');
  });
  test('reports unknown targets as unresolved', () => {
    expect(resolveReference({ kind: 'xref', target: 'missing', fileId: 'f1', range: { from: 0, to: 0 } }, symbols)).toBe('unresolved');
  });

  test('resolves an attributeRef case-insensitively (AsciiDoc attribute names are case-insensitive)', () => {
    const caseSymbols = extractSymbols('f1', ':Foo: bar\n');
    expect(resolveReference({ kind: 'attributeRef', target: 'foo', fileId: 'f1', range: { from: 0, to: 0 } }, caseSymbols)).not.toBe('unresolved');
    expect(resolveReference({ kind: 'attributeRef', target: 'FOO', fileId: 'f1', range: { from: 0, to: 0 } }, caseSymbols)).not.toBe('unresolved');
  });

  test('resolves a cross-file xref by its fragment (file.adoc#frag) — review fix', () => {
    expect(resolveReference({ kind: 'xref', target: 'chap.adoc#intro', fileId: 'f1', range: { from: 0, to: 0 } }, symbols)).not.toBe('unresolved');
    expect(resolveReference({ kind: 'xref', target: '#intro', fileId: 'f1', range: { from: 0, to: 0 } }, symbols)).not.toBe('unresolved');
  });
});

describe('buildIncludeGraph (FR-046/050)', () => {
  const files: Record<string, string> = {
    main: 'include::a.adoc[]\ninclude::b.adoc[leveloffset=+1]\n',
    a: 'include::missing.adoc[]\n',
    b: 'include::a.adoc[]\n', // a already visited → no infinite loop
  };
  const read = (id: string) => files[id] ?? null;
  const resolve = (_from: string, target: string) => {
    const id = target.replace('.adoc', '');
    return id in files ? id : null;
  };

  test('builds transitive nodes/edges, cycle-guarded', () => {
    const tree = buildIncludeGraph('main', read, resolve);
    expect(tree.nodes.toSorted()).toEqual(['a', 'b', 'main']);
    expect(tree.edges).toHaveLength(3); // main→a, main→b, b→a
  });

  test('records unresolved includes', () => {
    const tree = buildIncludeGraph('main', read, resolve);
    expect(tree.unresolved).toContainEqual(expect.objectContaining({ fromFile: 'a', target: 'missing.adoc' }));
  });

  test('edges carry the include leveloffset', () => {
    const tree = buildIncludeGraph('main', read, resolve);
    const edgeToB = tree.edges.find((edge) => edge.to === 'b');
    expect(edgeToB?.leveloffset).toBe(1);
  });
});

describe('inheritedLevelOffset (FR-071)', () => {
  const files: Record<string, string> = {
    main: 'include::a.adoc[leveloffset=+1]\n',
    a: 'include::b.adoc[leveloffset=+1]\n',
    b: '',
  };
  const tree = buildIncludeGraph(
    'main',
    (id) => files[id] ?? null,
    (_f, t) => t.replace('.adoc', ''),
  );

  test('root has offset 0', () => {
    expect(inheritedLevelOffset(tree, 'main')).toBe(0);
  });
  test('accumulates offsets along the include path', () => {
    expect(inheritedLevelOffset(tree, 'a')).toBe(1);
    expect(inheritedLevelOffset(tree, 'b')).toBe(2);
  });
  test('unreachable file → 0', () => {
    expect(inheritedLevelOffset(tree, 'orphan')).toBe(0);
  });
});
