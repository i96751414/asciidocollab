import { LRLanguage, LanguageSupport, language } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { Tree } from '@lezer/common';
import { asciidocLanguage, asciidoc } from '@/lib/codemirror/asciidoc-language';

/**
 * Wiring tests for `asciidoc-language.ts`. The jest transform loads the generated
 * `asciidoc-parser.js`, so the production `asciidocLanguage` (with the real external
 * tokenizer, highlight props and source-highlight `wrap`) is imported directly and
 * exercised end to end — parsing a small document through its configured parser.
 */

describe('asciidocLanguage', () => {
  test('is an LRLanguage named "asciidoc"', () => {
    expect(asciidocLanguage).toBeInstanceOf(LRLanguage);
    expect(asciidocLanguage.name).toBe('asciidoc');
  });

  test('exposes the line-comment token through languageDataAt', () => {
    const state = EditorState.create({ doc: 'text', extensions: [asciidoc()] });
    expect(state.facet(language)).toBe(asciidocLanguage);
    const commentTokens = state
      .languageDataAt<{ line: string }>('commentTokens', 0)
      .find(() => true);
    expect(commentTokens).toEqual({ line: '//' });
  });

  test('parses a small document into a non-empty tree', () => {
    const source = String.raw`= Title

A short paragraph.
`;
    const tree = asciidocLanguage.parser.parse(source);
    expect(tree).toBeInstanceOf(Tree);
    expect(tree.length).toBe(source.length);
    expect(tree.topNode.firstChild).not.toBeNull();
  });

  test('parses a [source] block (exercising the source-highlight wrap wiring)', () => {
    const source = String.raw`[source,js]
----
const x = 1;
----
`;
    const tree = asciidocLanguage.parser.parse(source);
    expect(tree).toBeInstanceOf(Tree);
    expect(tree.length).toBe(source.length);
  });
});

describe('asciidoc()', () => {
  test('returns a LanguageSupport wrapping the asciidocLanguage singleton', () => {
    const support = asciidoc();
    expect(support).toBeInstanceOf(LanguageSupport);
    expect(support.language).toBe(asciidocLanguage);
  });

  test('returns a fresh LanguageSupport on each call', () => {
    expect(asciidoc()).not.toBe(asciidoc());
  });

  // Load-bearing for source highlighting: the loader forces a re-parse via
  // `compartment.reconfigure(asciidoc({ fresh: true }))`, and CodeMirror only restarts parsing when
  // the language facet's Language object actually changes. So `{ fresh: true }` must wrap a DISTINCT
  // Language (≠ the singleton, and ≠ each other) — otherwise `[source,<lang>]` blocks stay
  // un-highlighted, the latent bug this guards against.
  test('{ fresh: true } wraps a DISTINCT Language each call so a reparse restarts parsing', () => {
    expect(asciidoc({ fresh: true }).language).not.toBe(asciidocLanguage);
    expect(asciidoc({ fresh: true }).language).not.toBe(asciidoc({ fresh: true }).language);
  });
});
