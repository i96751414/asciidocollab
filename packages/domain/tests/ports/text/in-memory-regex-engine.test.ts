import { InMemoryRegexEngine } from './in-memory-regex-engine';
import { MatchBudget } from '../../../src/ports/text/regex-engine';

const budget = (over: Partial<MatchBudget> = {}): MatchBudget => ({
  maxMatches: 1000,
  deadline: Number.POSITIVE_INFINITY,
  ...over,
});

describe('InMemoryRegexEngine (domain test fake)', () => {
  const engine = new InMemoryRegexEngine();

  it('rejects an invalid pattern with a ValidationError', () => {
    const result = engine.compile('(unbalanced', { caseSensitive: true, multiline: false });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.name).toBe('ValidationError');
  });

  it('returns spans with capture groups in document order', () => {
    const result = engine.compile('(a)(b)', { caseSensitive: true, multiline: false });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const spans = result.value.matches('ab xy ab', budget());
    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({ from: 0, to: 2, groups: ['ab', 'a', 'b'] });
    expect(spans[1]).toMatchObject({ from: 6, to: 8 });
  });

  it('honours case-insensitivity', () => {
    const result = engine.compile('abc', { caseSensitive: false, multiline: false });
    if (!result.success) return;
    expect(result.value.matches('ABC abc', budget())).toHaveLength(2);
  });

  it('exposes named capture groups', () => {
    const result = engine.compile(String.raw`(?<year>\d{4})`, { caseSensitive: true, multiline: false });
    if (!result.success) return;
    const spans = result.value.matches('year 2026', budget());
    expect(spans[0]?.named).toEqual({ year: '2026' });
  });

  it('stops at the maxMatches bound', () => {
    const result = engine.compile('a', { caseSensitive: true, multiline: false });
    if (!result.success) return;
    expect(result.value.matches('aaaaa', budget({ maxMatches: 2 }))).toHaveLength(2);
  });

  it('stops once the deadline has passed', () => {
    const result = engine.compile('a', { caseSensitive: true, multiline: false });
    if (!result.success) return;
    let ticks = 0;
    const spans = result.value.matches('aaaaa', budget({ deadline: 5, now: () => (ticks += 10) }));
    expect(spans).toHaveLength(0);
  });

  it('makes forward progress on zero-width matches', () => {
    const result = engine.compile('x*', { caseSensitive: true, multiline: false });
    if (!result.success) return;
    // Must terminate (not loop forever) even though x* matches empty everywhere.
    const spans = result.value.matches('ab', budget({ maxMatches: 10 }));
    expect(spans.length).toBeGreaterThan(0);
  });
});
