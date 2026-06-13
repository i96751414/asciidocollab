import {
  tokenizeWords,
  selectMisspelled,
  SPELLCHECK_SKIP_NODES,
} from '@/lib/codemirror/asciidoc-spellcheck';

describe('tokenizeWords (FR-063)', () => {
  test('splits prose into word tokens with absolute offsets', () => {
    const tokens = tokenizeWords('hello world', 10);
    expect(tokens.map((t) => t.word)).toEqual(['hello', 'world']);
    expect(tokens[0]).toMatchObject({ from: 10, to: 15 });
    expect(tokens[1]).toMatchObject({ from: 16, to: 21 });
  });
  test('keeps internal apostrophes, ignores digits/punctuation', () => {
    expect(tokenizeWords("don't 42 ok!").map((t) => t.word)).toEqual(["don't", 'ok']);
  });
});

const isCorrect = (word: string) => ['hello', 'world'].includes(word.toLowerCase());

describe('selectMisspelled (FR-063)', () => {
  test('flags words rejected by the checker', () => {
    const tokens = tokenizeWords('hello wrld');
    expect(selectMisspelled(tokens, isCorrect, []).map((t) => t.word)).toEqual(['wrld']);
  });
  test('respects the per-user ignore list (case-insensitive)', () => {
    const tokens = tokenizeWords('hello Wrld');
    expect(selectMisspelled(tokens, isCorrect, ['wrld'])).toHaveLength(0);
  });
  test('skips single-letter words', () => {
    const tokens = tokenizeWords('a b hello');
    expect(selectMisspelled(tokens, isCorrect, [])).toHaveLength(0);
  });
});

describe('SPELLCHECK_SKIP_NODES', () => {
  test('skips verbatim, macro, and attribute nodes (not prose)', () => {
    expect(SPELLCHECK_SKIP_NODES.has('ListingBlock')).toBe(true);
    expect(SPELLCHECK_SKIP_NODES.has('Monospace')).toBe(true);
    expect(SPELLCHECK_SKIP_NODES.has('InlineMacro')).toBe(true);
    expect(SPELLCHECK_SKIP_NODES.has('AttributeEntry')).toBe(true);
    // Prose-bearing nodes are NOT skipped.
    expect(SPELLCHECK_SKIP_NODES.has('Paragraph')).toBe(false);
    expect(SPELLCHECK_SKIP_NODES.has('Heading1')).toBe(false);
  });
});
