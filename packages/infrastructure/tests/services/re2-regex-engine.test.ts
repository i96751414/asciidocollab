import { Re2RegexEngine } from '../../src/services/re2-regex-engine';
import type { MatchBudget } from '@asciidocollab/domain';

const budget = (over: Partial<MatchBudget> = {}): MatchBudget => ({
  maxMatches: 10_000,
  deadline: Number.POSITIVE_INFINITY,
  ...over,
});

describe('Re2RegexEngine', () => {
  const engine = new Re2RegexEngine();

  it('rejects an invalid pattern with a ValidationError instead of throwing', () => {
    const result = engine.compile('(unclosed', { caseSensitive: true, multiline: false });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.name).toBe('ValidationError');
  });

  it('rejects backtracking-only constructs (lookahead) that RE2 cannot compile', () => {
    // RE2 has no backreferences/lookaround — such a pattern must be rejected up
    // front (an accepted trade-off of the linear-time guarantee), never run.
    const result = engine.compile('(?=foo)', { caseSensitive: true, multiline: false });
    expect(result.success).toBe(false);
  });

  it('returns spans with numbered and named capture groups', () => {
    const result = engine.compile(String.raw`(?<y>\d{4})-(\d{2})`, { caseSensitive: true, multiline: true });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const spans = result.value.matches('2026-07 and 1999-12', budget());
    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({ from: 0, to: 7, groups: ['2026-07', '2026', '07'] });
    expect(spans[0]?.named).toEqual({ y: '2026' });
  });

  it('stays bounded on a catastrophic-backtracking pattern (linear time, no hang)', () => {
    // (a+)+$ against a long run of 'a' with a trailing non-match is the classic
    // ReDoS: exponential on a backtracking engine, linear on RE2.
    const result = engine.compile('(a+)+$', { caseSensitive: true, multiline: false });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const evil = `${'a'.repeat(50_000)}!`;
    const start = Date.now();
    const spans = result.value.matches(evil, budget());
    const elapsed = Date.now() - start;
    expect(spans).toEqual([]); // no match (trailing '!')
    expect(elapsed).toBeLessThan(1000); // would be effectively infinite under backtracking
  });

  it('honours the maxMatches budget bound', () => {
    const result = engine.compile('a', { caseSensitive: true, multiline: false });
    if (!result.success) return;
    expect(result.value.matches('aaaaaa', budget({ maxMatches: 3 }))).toHaveLength(3);
  });

  it('is case-insensitive when requested', () => {
    const result = engine.compile('foo', { caseSensitive: false, multiline: false });
    if (!result.success) return;
    expect(result.value.matches('FOO Foo foo', budget())).toHaveLength(3);
  });
});
