import {
  buildProjectSymbolIndex,
  makeIncludeResolver,
} from '@/lib/codemirror/asciidoc-symbol-index';

// US8 projection over the shared asciidoc-model (does NOT re-test extraction).

const FILES: Record<string, { path: string; content: string }> = {
  main: {
    path: 'main.adoc',
    content: '= Book\n:author: Ada\n\n[[overview]]\n== Overview\n\ninclude::chapter1.adoc[]\n',
  },
  chapter1: {
    path: 'chapter1.adoc',
    content: '[[intro]]\n== Chapter One\n\nSee <<overview>>.\n\ninclude::../escape.adoc[]\n',
  },
};
const PATH_TO_ID: Record<string, string> = { 'main.adoc': 'main', 'chapter1.adoc': 'chapter1' };

const getContent = (id: string) => FILES[id]?.content ?? null;
const getMainContentOnly = (id: string) => (id === 'main' ? FILES.main.content : null);
const pathOf = (id: string) => FILES[id]?.path ?? null;
const resolveInclude = makeIncludeResolver(
  (id) => FILES[id]?.path ?? null,
  (path) => PATH_TO_ID[path] ?? null,
);

describe('buildProjectSymbolIndex', () => {
  test('aggregates symbols and references across the include tree', () => {
    const index = buildProjectSymbolIndex('main', getContent, resolveInclude);
    expect(index.tree.nodes.toSorted()).toEqual(['chapter1', 'main']);
    expect(index.symbols.some((s) => s.name === 'overview')).toBe(true);
    expect(index.symbols.some((s) => s.name === 'intro')).toBe(true);
    expect(index.references.some((r) => r.kind === 'xref' && r.target === 'overview')).toBe(true);
  });

  test('resolves a cross-file xref through the index', () => {
    const index = buildProjectSymbolIndex('main', getContent, resolveInclude);
    // chapter1 references <<overview>> which is defined in main.
    expect(index.resolveXref('overview')).not.toBe('unresolved');
    expect(index.resolveXref('does-not-exist')).toBe('unresolved');
  });

  test('resolves an attribute reference to its definition; unknown ⇒ unresolved', () => {
    const index = buildProjectSymbolIndex('main', getContent, resolveInclude);
    // main defines `:author: Ada`.
    expect(index.resolveAttribute('author')).not.toBe('unresolved');
    expect(index.resolveAttribute('nope')).toBe('unresolved');
  });

  test('inheritedOffset returns the accumulated level offset for a file', () => {
    const index = buildProjectSymbolIndex('main', getContent, resolveInclude);
    expect(typeof index.inheritedOffset('chapter1')).toBe('number');
  });

  test('skips files whose content is unavailable when aggregating', () => {
    // The include graph lists chapter1 as a node, but getContent only returns
    // content for main, exercising the `content === null` continue branch.
    const index = buildProjectSymbolIndex('main', getMainContentOnly, resolveInclude);
    expect(index.tree.nodes).toContain('chapter1');
    expect(index.symbols.every((s) => s.fileId === 'main')).toBe(true);
  });

  test('records an out-of-sandbox include as unresolved (Constitution IX)', () => {
    const index = buildProjectSymbolIndex('main', getContent, resolveInclude);
    // chapter1 includes ../escape.adoc which escapes the project root.
    expect(index.tree.unresolved.some((u) => u.target === '../escape.adoc')).toBe(true);
  });

  test('falls back to the open file when no main file (current-file scope, FR-047)', () => {
    const index = buildProjectSymbolIndex('chapter1', getContent, resolveInclude);
    expect(index.tree.rootFileId).toBe('chapter1');
    expect(index.symbols.some((s) => s.name === 'intro')).toBe(true);
  });
});

describe('go-to-definition locators (FR-049)', () => {
  test('pathOf maps a file id to its project-relative path; unknown ⇒ null', () => {
    const index = buildProjectSymbolIndex('main', getContent, resolveInclude, 'main', pathOf);
    expect(index.pathOf('chapter1')).toBe('chapter1.adoc');
    expect(index.pathOf('ghost')).toBeNull();
  });

  test('pathOf returns null when no path resolver is supplied', () => {
    const index = buildProjectSymbolIndex('main', getContent, resolveInclude);
    expect(index.pathOf('chapter1')).toBeNull();
  });

  test('lineOf converts a character offset to a 1-based line within the file', () => {
    const index = buildProjectSymbolIndex('main', getContent, resolveInclude, 'main', pathOf);
    // chapter1.adoc: '[[intro]]\n== Chapter One\n...': the '== Chapter One' heading starts on line 2.
    const heading = index.symbols.find((s) => s.kind === 'section' && s.fileId === 'chapter1');
    expect(heading).toBeDefined();
    expect(index.lineOf('chapter1', heading!.range.from)).toBe(2);
  });

  test('lineOf returns 1 when the file content is unavailable', () => {
    const index = buildProjectSymbolIndex('main', getContent, resolveInclude, 'main', pathOf);
    expect(index.lineOf('ghost', 0)).toBe(1);
  });
});

describe('makeIncludeResolver (Constitution IX sandbox)', () => {
  test('resolves a sibling include to its file id', () => {
    expect(resolveInclude('main', 'chapter1.adoc')).toBe('chapter1');
  });
  test('rejects traversal escaping the root', () => {
    expect(resolveInclude('main', '../secret.adoc')).toBeNull();
  });
  test('rejects remote targets', () => {
    expect(resolveInclude('main', 'https://evil.example/x.adoc')).toBeNull();
  });
  test('returns null when the referencing file has no known path', () => {
    expect(resolveInclude('ghost', 'chapter1.adoc')).toBeNull();
  });
});
