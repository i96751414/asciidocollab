import { hasToken, tokenAt, tokensOfType } from './helpers/tokenize';

// Deferred inline-construct rework (grammar-tokens.md):
// narrow `inlineWord` and add dedicated tokens for inline passthrough, inline/biblio
// anchors, replacements, entities, code callouts, and the block-level thematic/page
// breaks — WITHOUT regressing existing emphasis / xref / attr-ref / prose tokenization.

describe('inline — passthrough (+x+)', () => {
  test('recognises +x+ as a Passthrough', () => {
    expect(hasToken('a +literal+ b\n', 'Passthrough')).toBe(true);
  });

  test('a lone + in arithmetic prose is NOT a passthrough', () => {
    expect(hasToken('1 + 2 = 3\n', 'Passthrough')).toBe(false);
    expect(tokensOfType('1 + 2 = 3\n', 'Paragraph')).toHaveLength(1);
  });

  test('a + immediately followed by a space does not open a passthrough', () => {
    expect(hasToken('x + y + z\n', 'Passthrough')).toBe(false);
  });
});

describe('inline — inline & bibliography anchors', () => {
  test('recognises [[id]] as an InlineAnchor', () => {
    expect(hasToken('text [[anchor-id]] more\n', 'InlineAnchor')).toBe(true);
  });

  test('recognises [[[ref]]] as a BiblioAnchor', () => {
    expect(hasToken('[[[biblio-ref]]] citation\n', 'BiblioAnchor')).toBe(true);
  });

  test('a single bracketed word [note] in prose is NOT an anchor', () => {
    expect(hasToken('see [note] here\n', 'InlineAnchor')).toBe(false);
    expect(hasToken('see [note] here\n', 'BiblioAnchor')).toBe(false);
  });
});

describe('inline — replacements & entities', () => {
  test.each(['(C)', '(R)', '(TM)'])('recognises %s as a Replacement', (mark) => {
    expect(hasToken(`Acme ${mark} brand\n`, 'Replacement')).toBe(true);
  });

  test('a function call f(x) is NOT a replacement', () => {
    expect(hasToken('call f(x) now\n', 'Replacement')).toBe(false);
  });

  test.each(['&amp;', '&#8217;'])('recognises %s as an Entity', (entity) => {
    expect(hasToken(`A ${entity} B\n`, 'Entity')).toBe(true);
  });

  test('a bare ampersand in Q&A is NOT an entity', () => {
    expect(hasToken('a Q&A session\n', 'Entity')).toBe(false);
  });
});

describe('inline — code callouts', () => {
  test('recognises <1> as a Callout', () => {
    expect(hasToken('puts x <1>\n', 'Callout')).toBe(true);
  });

  test('an xref <<intro>> is NOT a callout (and still tokenizes as CrossReference)', () => {
    expect(hasToken('see <<intro>>\n', 'Callout')).toBe(false);
    expect(hasToken('see <<intro>>\n', 'CrossReference')).toBe(true);
  });

  test('a less-than comparison a < b does not crash tokenization', () => {
    expect(tokensOfType('a < b\n', 'Paragraph')).toHaveLength(1);
  });
});

describe('inline — bare URLs', () => {
  test.each([
    'https://example.com',
    'http://example.com/path',
    'ftp://files.example.com',
    'irc://chat.example.com',
  ])('recognises %s as a Link', (url) => {
    expect(hasToken(`visit ${url} today\n`, 'Link')).toBe(true);
  });

  test('a bare URL is recognised at the very start of a line', () => {
    expect(hasToken('https://example.com is the site\n', 'Link')).toBe(true);
  });

  test('a word with a colon that is not a scheme is NOT a Link', () => {
    expect(hasToken('note:something here\n', 'Link')).toBe(false);
    expect(hasToken('the ratio is 3:45 today\n', 'Link')).toBe(false);
    expect(hasToken('plain https without scheme\n', 'Link')).toBe(false);
    expect(tokensOfType('note:something here\n', 'Paragraph')).toHaveLength(1);
  });
});

describe('inline — link/mailto/menu macros & mid-line macros', () => {
  test.each([
    'link:http://example.com[Site]',
    'mailto:a@b.com[Mail me]',
    'menu:File[Save]',
    'xref:other.adoc#sec[See]',
  ])('recognises mid-line %s as an InlineMacro', (macro) => {
    expect(hasToken(`text ${macro} more\n`, 'InlineMacro')).toBe(true);
  });

  test('a mid-line footnote:[…] tokenizes as a Footnote', () => {
    expect(hasToken('a claim footnote:[a source] here\n', 'Footnote')).toBe(true);
  });

  test('a colon word with no bracket args is NOT an inline macro', () => {
    expect(hasToken('the note:plain stays text\n', 'InlineMacro')).toBe(false);
    expect(tokensOfType('the note:plain stays text\n', 'Paragraph')).toHaveLength(1);
  });

  test('a block macro image::pic.png[] (double colon) is not an inline macro', () => {
    expect(hasToken('image::pic.png[]\n', 'InlineMacro')).toBe(false);
  });

  test('kbd:[x] stays a UiMacro (not swallowed by the generic inline-macro token)', () => {
    expect(hasToken('press kbd:[Esc] now\n', 'UiMacro')).toBe(true);
    expect(hasToken('press kbd:[Esc] now\n', 'InlineMacro')).toBe(false);
  });
});

describe('inline — UI & math macros', () => {
  test.each(['kbd:[Ctrl+S]', 'btn:[OK]'])('recognises %s as a UiMacro', (macro) => {
    expect(hasToken(`press ${macro} now\n`, 'UiMacro')).toBe(true);
  });

  test.each(['stem:[x^2]', String.raw`latexmath:[\sqrt{n}]`, 'asciimath:[a/b]'])(
    'recognises %s as an InlineStem',
    (macro) => {
      expect(hasToken(`see ${macro} here\n`, 'InlineStem')).toBe(true);
    },
  );

  test('a bare word "keyboard" is not a UiMacro', () => {
    expect(hasToken('keyboard layout\n', 'UiMacro')).toBe(false);
    expect(tokensOfType('keyboard layout\n', 'Paragraph')).toHaveLength(1);
  });

  test('kbd:[x] works at the very start of a line', () => {
    expect(hasToken('kbd:[Esc] cancels\n', 'UiMacro')).toBe(true);
  });
});

describe('inline — smart typographic quotes', () => {
  test('recognises a double curly quote "`x`" as a SmartQuote', () => {
    expect(hasToken('a "`quoted`" b\n', 'SmartQuote')).toBe(true);
  });

  test('recognises a single curly quote \'`x`\' as a SmartQuote', () => {
    expect(hasToken("a '`quoted`' b\n", 'SmartQuote')).toBe(true);
  });

  test('a plain double-quoted "hello" is NOT a SmartQuote', () => {
    expect(hasToken('say "hello" loud\n', 'SmartQuote')).toBe(false);
    expect(tokensOfType('say "hello" loud\n', 'Paragraph')).toHaveLength(1);
  });

  test("an apostrophe in don't does not start a SmartQuote and stays prose", () => {
    expect(hasToken("don't stop now\n", 'SmartQuote')).toBe(false);
    expect(tokensOfType("don't stop now\n", 'Paragraph')).toHaveLength(1);
    expect(tokensOfType("don't stop now\n", '⚠')).toHaveLength(0);
  });
});

describe('inline — hard line break', () => {
  test('a trailing " +" at end of a line is a HardBreak', () => {
    expect(hasToken('first line +\nsecond line\n', 'HardBreak')).toBe(true);
  });

  test('a mid-line " + " (arithmetic/spacing) is NOT a hard break', () => {
    expect(hasToken('a + b is math\n', 'HardBreak')).toBe(false);
    expect(tokensOfType('a + b is math\n', '⚠')).toHaveLength(0);
  });

  test('a trailing "+" with no preceding space is not a hard break', () => {
    expect(hasToken('c++\n', 'HardBreak')).toBe(false);
  });
});

describe('block — thematic & page breaks', () => {
  test("recognises ''' as a ThematicBreak", () => {
    expect(hasToken("'''\n", 'ThematicBreak')).toBe(true);
  });

  test('recognises <<< as a PageBreak', () => {
    expect(hasToken('<<<\n', 'PageBreak')).toBe(true);
  });

  test('a paragraph that merely contains <<< inline is not a PageBreak block', () => {
    expect(hasToken('text <<< more\n', 'PageBreak')).toBe(false);
  });
});

describe('inline rework — existing tokenization not regressed', () => {
  test('emphasis containing a narrowed char still spans the whole run', () => {
    // `*a+b*` — the `+` inside bold must not split the Bold node.
    expect(hasToken('*a+b*\n', 'Bold')).toBe(true);
    expect(tokenAt('*a+b*\n', 'Bold', 0)).toBe(true);
  });

  test('bold/italic/monospace/xref/attr-ref all still tokenize', () => {
    expect(hasToken('a *b* _i_ `c`\n', 'Bold')).toBe(true);
    expect(hasToken('a *b* _i_ `c`\n', 'Italic')).toBe(true);
    expect(hasToken('a *b* _i_ `c`\n', 'Monospace')).toBe(true);
    expect(hasToken('see <<intro>>\n', 'CrossReference')).toBe(true);
    expect(hasToken('v{version}\n', 'AttributeReference')).toBe(true);
  });

  test('plain prose with assorted punctuation remains a single Paragraph', () => {
    expect(tokensOfType('cost is 3 (each) & up + tax\n', 'Paragraph')).toHaveLength(1);
  });

  test.each([
    "'tis the season\n", // leading apostrophe, not a thematic break
    '<<intro>> opens a line\n', // xref at the very start of a line
    'a << b and c\n', // bare `<<` that never closes
    'use ++ carefully\n', // bare `++` with no inner
    'price (each) here\n', // unmatched parenthesis word
    'array[0] index\n', // single bracket in prose
  ])('tricky prose %j stays a single Paragraph (no parser error)', (source) => {
    expect(tokensOfType(source, 'Paragraph')).toHaveLength(1);
    expect(tokensOfType(source, '⚠')).toHaveLength(0); // Lezer's error-node name
  });
});
