import { hasToken, tokenAt, tokensOfType } from './helpers/tokenize';

// US7 / FR-051/053/025 + contracts/grammar-tokens.md: complete highlighting
// coverage. These assert the new block-level grammar tokens are produced AND
// that existing tokenization is not regressed.

describe('US7 grammar — conditional directives (FR-051)', () => {
  test.each(['ifdef::env[]\n', 'ifndef::env[]\n', 'ifeval::[1==1]\n', 'endif::[]\n'])(
    'recognises %j as a Conditional (not a generic BlockMacro)',
    (input) => {
      expect(hasToken(input, 'Conditional')).toBe(true);
      expect(hasToken(input, 'BlockMacro')).toBe(false);
    },
  );

  test('ifdef with a single-directive body still tokenizes as Conditional', () => {
    expect(hasToken('ifdef::backend-html5[Only for HTML]\n', 'Conditional')).toBe(true);
  });
});

describe('US7 grammar — generic block-attribute line (FR-025)', () => {
  test.each([
    '[source,ruby]\n',
    '[%header]\n',
    '[.lead]\n',
    '[quote, Author]\n',
  ])('recognises %j as a BlockAttributeLine', (input) => {
    expect(hasToken(input, 'BlockAttributeLine')).toBe(true);
  });

  // A `[cols="…"]` line now routes to the distinct TableCols node (FR-046, US12), NOT the generic
  // block-attribute line — the cols specifier is highlighted distinctly.
  test('[cols="1,1"] routes to a TableCols node, not the generic block-attribute line', () => {
    expect(hasToken('[cols="1,1"]\n', 'TableCols')).toBe(true);
    expect(hasToken('[cols="1,1"]\n', 'BlockAttributeLine')).toBe(false);
  });

  test('[stem] still routes to StemBlock, not the generic block-attribute line', () => {
    const source = '[stem]\n++++\nx^2\n++++\n';
    expect(hasToken(source, 'StemBlock')).toBe(true);
  });

  test('[NOTE] still routes to an AdmonitionBlock', () => {
    const source = '[NOTE]\n====\nnote\n====\n';
    expect(hasToken(source, 'AdmonitionBlock')).toBe(true);
  });

  test('a [source] attribute line precedes a listing block without breaking it', () => {
    const source = '[source,ruby]\n----\nputs 1\n----\n';
    expect(hasToken(source, 'BlockAttributeLine')).toBe(true);
    expect(hasToken(source, 'ListingBlock')).toBe(true);
  });
});

describe('US7 grammar — CSV / DSV tables (FR-053)', () => {
  test('recognises a ,=== CSV table block', () => {
    const source = ',===\na,b\nc,d\n,===\n';
    expect(hasToken(source, 'CsvTableBlock')).toBe(true);
  });

  test('recognises a :=== DSV table block', () => {
    const source = ':===\na:b\nc:d\n:===\n';
    expect(hasToken(source, 'DsvTableBlock')).toBe(true);
  });

  test('a |=== PSV table is still a TableBlock (not regressed)', () => {
    expect(hasToken('|===\n| a | b\n|===\n', 'TableBlock')).toBe(true);
  });
});

describe('US7 grammar — existing tokenization not regressed', () => {
  test('bold/italic/monospace still tokenize', () => {
    expect(hasToken('a *b* _i_ `c`\n', 'Bold')).toBe(true);
    expect(hasToken('a *b* _i_ `c`\n', 'Italic')).toBe(true);
    expect(hasToken('a *b* _i_ `c`\n', 'Monospace')).toBe(true);
  });

  test('xref and attribute-reference still tokenize', () => {
    expect(hasToken('see <<intro>>\n', 'CrossReference')).toBe(true);
    expect(hasToken('v{version}\n', 'AttributeReference')).toBe(true);
  });

  test('headings and attribute entries still tokenize', () => {
    expect(hasToken('== Section\n', 'Heading1')).toBe(true);
    expect(hasToken(':author: x\n', 'AttributeEntry')).toBe(true);
    expect(tokenAt('== Section\n', 'Heading1', 0)).toBe(true);
  });

  test('a plain paragraph remains a single Paragraph', () => {
    expect(tokensOfType('just words here\n', 'Paragraph')).toHaveLength(1);
  });
});
