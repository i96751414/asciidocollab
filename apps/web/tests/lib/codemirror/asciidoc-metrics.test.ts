import { computeMetrics, WORDS_PER_MINUTE } from '@/lib/codemirror/asciidoc-metrics';

describe('computeMetrics (FR-044)', () => {
  test('counts word-like tokens, ignoring pure markup', () => {
    expect(computeMetrics('== Hello World').words).toBe(2);
    expect(computeMetrics('one two three four').words).toBe(4);
    expect(computeMetrics('----\n|===\n***').words).toBe(0);
  });

  test('counts words with apostrophes/hyphens as one', () => {
    expect(computeMetrics("don't re-use").words).toBe(2);
  });

  test('empty document → 0 words, 0 minutes', () => {
    expect(computeMetrics('')).toEqual({ words: 0, readingTimeMin: 0 });
  });

  test('reading time is at least 1 minute for any text', () => {
    expect(computeMetrics('a few words').readingTimeMin).toBe(1);
  });

  test('reading time scales by ~200 wpm', () => {
    const text = Array.from({ length: WORDS_PER_MINUTE * 3 }, () => 'word').join(' ');
    expect(computeMetrics(text).readingTimeMin).toBe(3);
  });
});
