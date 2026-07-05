import {
  computeMatches,
  substitute,
  selectSpans,
  SearchQuery,
} from '../../../src/use-cases/content/text-match';
import { MatchBudget, MatchSpan } from '../../../src/ports/text/regex-engine';
import { InMemoryRegexEngine } from '../../ports/text/in-memory-regex-engine';

const budget = (over: Partial<MatchBudget> = {}): MatchBudget => ({
  maxMatches: 1000,
  deadline: Number.POSITIVE_INFINITY,
  ...over,
});

const query = (over: Partial<SearchQuery> = {}): SearchQuery => ({
  text: 'foo',
  mode: 'literal',
  caseSensitive: true,
  wholeWord: false,
  ...over,
});

describe('computeMatches — literal', () => {
  it('finds every occurrence with correct offsets', () => {
    const result = computeMatches('foo bar foo', query(), undefined, budget());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.map((s) => [s.from, s.to])).toEqual([
      [0, 3],
      [8, 11],
    ]);
    expect(result.value[0]?.groups).toEqual(['foo']);
  });

  it('is case-insensitive when requested', () => {
    const result = computeMatches('Foo FOO foo', query({ caseSensitive: false }), undefined, budget());
    if (!result.success) return;
    expect(result.value).toHaveLength(3);
  });

  it('respects whole-word boundaries', () => {
    const result = computeMatches('foo food afoo foo!', query({ wholeWord: true }), undefined, budget());
    if (!result.success) return;
    // matches: leading "foo" (0), and "foo" before "!" — not "food" nor "afoo"
    expect(result.value.map((s) => s.from)).toEqual([0, 14]);
  });

  it('finds an overlapping whole-word occurrence after a boundary-rejected candidate', () => {
    // "a.a" at offset 1 is rejected (preceded by word char "x"); the overlapping "a.a" at offset 3
    // (preceded by ".", at end of string) is a valid whole word and must still be found.
    const sensitive = computeMatches('xa.a.a', query({ text: 'a.a', wholeWord: true }), undefined, budget());
    if (!sensitive.success) return;
    expect(sensitive.value.map((s) => s.from)).toEqual([3]);

    const insensitive = computeMatches('XA.a.A', query({ text: 'a.a', wholeWord: true, caseSensitive: false }), undefined, budget());
    if (!insensitive.success) return;
    expect(insensitive.value.map((s) => s.from)).toEqual([3]);
  });

  it('treats regex-special characters literally in literal mode', () => {
    const result = computeMatches('a.b axb a.b', query({ text: 'a.b' }), undefined, budget());
    if (!result.success) return;
    expect(result.value.map((s) => s.from)).toEqual([0, 8]);
  });

  it('keeps offsets exact for case-insensitive search after a length-changing case char', () => {
    // "İ" (U+0130) lower-cases to two code units; lowercasing the whole haystack would shift the
    // reported offset of "foo". The match must stay at its true index 2 (İ=0, space=1, f=2).
    const result = computeMatches('İ foo', query({ text: 'foo', caseSensitive: false }), undefined, budget());
    if (!result.success) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({ from: 2, to: 5, groups: ['foo'] });
  });

  it('stops at the maxMatches budget', () => {
    const result = computeMatches('aaaa', query({ text: 'a' }), undefined, budget({ maxMatches: 2 }));
    if (!result.success) return;
    expect(result.value).toHaveLength(2);
  });
});

describe('computeMatches — regex', () => {
  const engine = new InMemoryRegexEngine();

  it('matches via the injected engine with capture groups', () => {
    const result = computeMatches('2026-07', query({ text: String.raw`(\d+)-(\d+)`, mode: 'regex' }), engine, budget());
    if (!result.success) return;
    expect(result.value[0]?.groups).toEqual(['2026-07', '2026', '07']);
  });

  it('surfaces an invalid pattern as a ValidationError', () => {
    const result = computeMatches('x', query({ text: '(bad', mode: 'regex' }), engine, budget());
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.name).toBe('ValidationError');
  });

  it('errors when regex mode is used without an engine', () => {
    const result = computeMatches('x', query({ text: 'x', mode: 'regex' }), undefined, budget());
    expect(result.success).toBe(false);
  });
});

describe('substitute', () => {
  const span: MatchSpan = {
    from: 0,
    to: 7,
    groups: ['2026-07', '2026', '07'],
    named: { year: '2026' },
  };

  it('returns the replacement verbatim in literal mode', () => {
    expect(substitute('$1 literal', span, 'literal')).toBe('$1 literal');
  });

  it('expands numbered groups, named groups, $& and $$ in regex mode', () => {
    expect(substitute('$2/$1', span, 'regex')).toBe('07/2026');
    expect(substitute('${year}!', span, 'regex')).toBe('2026!');
    expect(substitute('[$&]', span, 'regex')).toBe('[2026-07]');
    expect(substitute('50$$', span, 'regex')).toBe('50$');
  });

  it('emits a reference to an absent numbered group literally (JS/VS Code convention)', () => {
    expect(substitute('$5 off', span, 'regex')).toBe('$5 off');
    // `$1` resolves to group 1 (2026); the trailing digits are literal.
    expect(substitute('$100', span, 'regex')).toBe('202600');
  });

  it('emits an unknown named group reference literally', () => {
    expect(substitute('${month}!', span, 'regex')).toBe('${month}!');
  });
});

describe('selectSpans', () => {
  const spans: MatchSpan[] = [
    { from: 0, to: 3, groups: ['foo'] },
    { from: 8, to: 11, groups: ['foo'] },
    { from: 20, to: 23, groups: ['foo'] },
  ];

  it('keeps confirmed ordinals and orders edits right-to-left', () => {
    const edits = selectSpans(
      spans,
      [
        { ordinal: 0, expectedText: 'foo' },
        { ordinal: 2, expectedText: 'foo' },
      ],
      'bar',
      'literal',
    );
    expect(edits).toEqual([
      { from: 20, to: 23, replacement: 'bar' },
      { from: 0, to: 3, replacement: 'bar' },
    ]);
  });

  it('skips a stale ordinal whose live text diverged', () => {
    expect(selectSpans(spans, [{ ordinal: 1, expectedText: 'FOO' }], 'bar', 'literal')).toEqual([]);
  });

  it('skips an ordinal that no longer exists', () => {
    expect(selectSpans(spans, [{ ordinal: 9, expectedText: 'foo' }], 'bar', 'literal')).toEqual([]);
  });

  it('de-duplicates a repeated ordinal so a span is edited at most once', () => {
    const edits = selectSpans(
      spans,
      [
        { ordinal: 1, expectedText: 'foo' },
        { ordinal: 1, expectedText: 'foo' },
      ],
      'bar',
      'literal',
    );
    expect(edits).toEqual([{ from: 8, to: 11, replacement: 'bar' }]);
  });
});
