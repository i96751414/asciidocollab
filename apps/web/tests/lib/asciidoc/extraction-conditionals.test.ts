import {
  parseIncludeTags,
  parseIncludeLines,
  parseConditional,
  evaluateConditional,
} from '@/lib/asciidoc/extraction';
import type { ConditionalExpr } from '@asciidocollab/shared';

// Unit coverage for the partial-include selectors and the restricted, non-`eval`
// conditional grammar (Constitution IX). These rules are mirrored in
// @asciidocollab/domain; the parity test locks the two copies in agreement.

/** Build a resolved attribute scope from a plain record for the evaluation tests. */
const scope = (entries: Record<string, string>): ReadonlyMap<string, string> =>
  new Map(Object.entries(entries));

describe('parseIncludeTags', () => {
  test('returns null when no tags= selector is present', () => {
    expect(parseIncludeTags('leveloffset=+1')).toBeNull();
    expect(parseIncludeTags('')).toBeNull();
  });

  test('parses a single tag', () => {
    expect(parseIncludeTags('tag=snippet')).toEqual(['snippet']);
    expect(parseIncludeTags('tags=snippet')).toEqual(['snippet']);
  });

  test('parses multiple tags separated by ; (unquoted) or , (quoted)', () => {
    // Unquoted, `;` separates tags; a `,` would start a new include attribute, so commas in a tag
    // list must be quoted (AsciiDoc attribute-list semantics).
    expect(parseIncludeTags('tags=a;b;c')).toEqual(['a', 'b', 'c']);
    expect(parseIncludeTags('tags="a,b"')).toEqual(['a', 'b']);
  });

  test('parses negated tags and wildcards', () => {
    expect(parseIncludeTags('tags=*;!internal')).toEqual(['*', '!internal']);
    expect(parseIncludeTags('tags=**;!*')).toEqual(['**', '!*']);
  });

  test('tolerates quoting around the tag list', () => {
    expect(parseIncludeTags('tags="a;b"')).toEqual(['a', 'b']);
  });
});

describe('parseIncludeLines', () => {
  test('returns null when no lines= selector is present', () => {
    expect(parseIncludeLines('tags=a')).toBeNull();
    expect(parseIncludeLines('')).toBeNull();
  });

  test('parses a single line', () => {
    expect(parseIncludeLines('lines=2')).toEqual([[2, 2]]);
  });

  test('parses a closed range', () => {
    expect(parseIncludeLines('lines=2..4')).toEqual([[2, 4]]);
  });

  test('parses multiple ranges separated by ; or ,', () => {
    expect(parseIncludeLines('lines=1;3..4')).toEqual([
      [1, 1],
      [3, 4],
    ]);
    expect(parseIncludeLines('lines="1,3..4"')).toEqual([
      [1, 1],
      [3, 4],
    ]);
  });

  test('parses an open-ended range (..-1 or trailing ..) as end null', () => {
    expect(parseIncludeLines('lines=5..-1')).toEqual([[5, null]]);
    expect(parseIncludeLines('lines=5..')).toEqual([[5, null]]);
  });
});

describe('parseConditional', () => {
  test('parses ifdef with a single attribute', () => {
    expect(parseConditional('ifdef::env[]')).toEqual<ConditionalExpr>({
      kind: 'ifdef',
      attrs: ['env'],
      expr: null,
    });
  });

  test('parses ifndef', () => {
    expect(parseConditional('ifndef::draft[]')).toEqual<ConditionalExpr>({
      kind: 'ifndef',
      attrs: ['draft'],
      expr: null,
    });
  });

  test('parses ifdef with , (OR) and + (AND) attribute lists', () => {
    expect(parseConditional('ifdef::a,b[]')?.attrs).toEqual(['a', 'b']);
    expect(parseConditional('ifdef::a+b[]')?.attrs).toEqual(['a', 'b']);
  });

  test('downcases attribute names', () => {
    expect(parseConditional('ifdef::Env[]')?.attrs).toEqual(['env']);
  });

  test('parses ifeval into a restricted comparison', () => {
    expect(parseConditional('ifeval::["{ver}" == "2"]')).toEqual<ConditionalExpr>({
      kind: 'ifeval',
      attrs: [],
      expr: { lhs: '"{ver}"', op: '==', rhs: '"2"' },
    });
  });

  test.each(['==', '!=', '<', '<=', '>', '>='])('parses ifeval operator %s', (op) => {
    expect(parseConditional(`ifeval::[1 ${op} 2]`)?.expr?.op).toBe(op);
  });

  test('parses endif as null (not a region opener)', () => {
    expect(parseConditional('endif::[]')).toBeNull();
  });

  test('returns null for a non-conditional line', () => {
    expect(parseConditional('Just some prose.')).toBeNull();
    expect(parseConditional(':attr: value')).toBeNull();
  });
});

describe('evaluateConditional', () => {
  test('ifdef is true when the attribute is defined', () => {
    expect(evaluateConditional({ kind: 'ifdef', attrs: ['env'], expr: null }, scope({ env: 'prod' }))).toBe(true);
    expect(evaluateConditional({ kind: 'ifdef', attrs: ['env'], expr: null }, scope({}))).toBe(false);
  });

  test('ifndef is true when the attribute is undefined', () => {
    expect(evaluateConditional({ kind: 'ifndef', attrs: ['draft'], expr: null }, scope({}))).toBe(true);
    expect(evaluateConditional({ kind: 'ifndef', attrs: ['draft'], expr: null }, scope({ draft: '' }))).toBe(false);
  });

  test('an empty-string attribute value still counts as defined for ifdef', () => {
    expect(evaluateConditional({ kind: 'ifdef', attrs: ['flag'], expr: null }, scope({ flag: '' }))).toBe(true);
  });

  test('ifdef with a , list is OR (any defined)', () => {
    const expr: ConditionalExpr = { kind: 'ifdef', attrs: ['a', 'b'], expr: null };
    // parseConditional flattens , and + into attrs; the OR/AND distinction is carried separately,
    // so the directive line is what selects semantics. Here we test the OR-style list via parse.
    expect(evaluateConditional(parseConditional('ifdef::a,b[]')!, scope({ b: '1' }))).toBe(true);
    expect(evaluateConditional(parseConditional('ifdef::a,b[]')!, scope({}))).toBe(false);
    // attrs as a plain list (no operator metadata) defaults to OR for ifdef.
    expect(evaluateConditional(expr, scope({ a: '1' }))).toBe(true);
  });

  test('ifdef with a + list is AND (all defined)', () => {
    expect(evaluateConditional(parseConditional('ifdef::a+b[]')!, scope({ a: '1', b: '2' }))).toBe(true);
    expect(evaluateConditional(parseConditional('ifdef::a+b[]')!, scope({ a: '1' }))).toBe(false);
  });

  test('ifdef mixing both separators selects OR (comma) first, matching Asciidoctor', () => {
    // Asciidoctor chooses the `,` (OR) delimiter before `+` (AND) when both are present, so `a+b,c`
    // splits on `,` into [`a+b`, `c`] and ORs them — the region is active when `c` alone is defined.
    // The previous code picked AND whenever a `+` appeared, wrongly requiring all of a, b, c.
    expect(evaluateConditional(parseConditional('ifdef::a+b,c[]')!, scope({ c: '1' }))).toBe(true);
    expect(evaluateConditional(parseConditional('ifdef::a+b,c[]')!, scope({}))).toBe(false);
  });

  test('ifndef with a , list is true when none are defined', () => {
    expect(evaluateConditional(parseConditional('ifndef::a,b[]')!, scope({}))).toBe(true);
    expect(evaluateConditional(parseConditional('ifndef::a,b[]')!, scope({ a: '1' }))).toBe(false);
  });

  test('ifeval resolves {attr} references then compares (no eval)', () => {
    const expr = parseConditional('ifeval::["{ver}" == "2"]')!;
    expect(evaluateConditional(expr, scope({ ver: '2' }))).toBe(true);
    expect(evaluateConditional(expr, scope({ ver: '3' }))).toBe(false);
  });

  test('ifeval numeric comparison', () => {
    expect(evaluateConditional(parseConditional('ifeval::[{n} >= 3]')!, scope({ n: '5' }))).toBe(true);
    expect(evaluateConditional(parseConditional('ifeval::[{n} >= 3]')!, scope({ n: '1' }))).toBe(false);
    expect(evaluateConditional(parseConditional('ifeval::[{n} < 3]')!, scope({ n: '1' }))).toBe(true);
  });

  test('ifeval != comparison', () => {
    expect(evaluateConditional(parseConditional('ifeval::["{a}" != "x"]')!, scope({ a: 'y' }))).toBe(true);
  });

  test('ifeval treats a quoted operand as a string, not a number (Asciidoctor semantics)', () => {
    // A quoted "2" is the STRING "2"; an unquoted 2 is the integer 2. They are not equal.
    expect(evaluateConditional(parseConditional('ifeval::["2" == 2]')!, scope({}))).toBe(false);
    expect(evaluateConditional(parseConditional('ifeval::[2 == "2"]')!, scope({}))).toBe(false);
    // Both unquoted numbers compare numerically (equal); both quoted strings compare as strings (equal).
    expect(evaluateConditional(parseConditional('ifeval::[2 == 2]')!, scope({}))).toBe(true);
    expect(evaluateConditional(parseConditional('ifeval::["2" == "2"]')!, scope({}))).toBe(true);
    // Numeric equality ignores formatting only when both sides are unquoted numbers.
    expect(evaluateConditional(parseConditional('ifeval::[2 == 2.0]')!, scope({}))).toBe(true);
  });

  test('ifeval ORDERING with a mixed number/string operand pair compares as strings (not NaN coercion)', () => {
    // `{x} < beta` resolves to numeric 3 vs the string "beta". Asciidoctor compares them as STRINGS
    // ("3" < "beta") when they are not both numeric; the buggy JS path did `3 < "beta"` → NaN → false.
    expect(evaluateConditional(parseConditional('ifeval::[{x} < beta]')!, scope({ x: '3' }))).toBe(true);
    expect(evaluateConditional(parseConditional('ifeval::[beta < {x}]')!, scope({ x: '3' }))).toBe(false);
    // A quoted numeric string vs an unquoted number also compares as strings for ordering.
    expect(evaluateConditional(parseConditional('ifeval::["10" < 9]')!, scope({}))).toBe(true); // "10" < "9"
    // Both unquoted numbers still compare numerically (10 is NOT < 9).
    expect(evaluateConditional(parseConditional('ifeval::[10 < 9]')!, scope({}))).toBe(false);
  });
});
