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

  it('treats regex-special characters literally in literal mode', () => {
    const result = computeMatches('a.b axb a.b', query({ text: 'a.b' }), undefined, budget());
    if (!result.success) return;
    expect(result.value.map((s) => s.from)).toEqual([0, 8]);
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
    const result = computeMatches('2026-07', query({ text: '(\\d+)-(\\d+)', mode: 'regex' }), engine, budget());
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
    const result = substitute('$1 literal', span, 'literal');
    expect(result.success && result.value).toBe('$1 literal');
  });

  it('expands numbered groups, named groups, $& and $$ in regex mode', () => {
    expect(substitute('$2/$1', span, 'regex')).toEqual({ success: true, value: '07/2026' });
    expect(substitute('${year}!', span, 'regex')).toEqual({ success: true, value: '2026!' });
    expect(substitute('[$&]', span, 'regex')).toEqual({ success: true, value: '[2026-07]' });
    expect(substitute('50$$', span, 'regex')).toEqual({ success: true, value: '50$' });
  });

  it('rejects a reference to an absent numbered group', () => {
    const result = substitute('$5', span, 'regex');
    expect(result.success).toBe(false);
  });

  it('rejects a reference to an unknown named group', () => {
    const result = substitute('${month}', span, 'regex');
    expect(result.success).toBe(false);
  });
});

describe('selectSpans', () => {
  const spans: MatchSpan[] = [
    { from: 0, to: 3, groups: ['foo'] },
    { from: 8, to: 11, groups: ['foo'] },
    { from: 20, to: 23, groups: ['foo'] },
  ];

  it('keeps confirmed ordinals and orders edits right-to-left', () => {
    const result = selectSpans(
      spans,
      [
        { ordinal: 0, expectedText: 'foo' },
        { ordinal: 2, expectedText: 'foo' },
      ],
      'bar',
      'literal',
    );
    if (!result.success) return;
    expect(result.value).toEqual([
      { from: 20, to: 23, replacement: 'bar' },
      { from: 0, to: 3, replacement: 'bar' },
    ]);
  });

  it('skips a stale ordinal whose live text diverged', () => {
    const result = selectSpans(spans, [{ ordinal: 1, expectedText: 'FOO' }], 'bar', 'literal');
    if (!result.success) return;
    expect(result.value).toEqual([]);
  });

  it('skips an ordinal that no longer exists', () => {
    const result = selectSpans(spans, [{ ordinal: 9, expectedText: 'foo' }], 'bar', 'literal');
    if (!result.success) return;
    expect(result.value).toEqual([]);
  });

  it('bubbles up an invalid replacement template', () => {
    const withGroups: MatchSpan[] = [{ from: 0, to: 3, groups: ['abc'] }];
    const result = selectSpans(withGroups, [{ ordinal: 0, expectedText: 'abc' }], '$3', 'regex');
    expect(result.success).toBe(false);
  });
});
