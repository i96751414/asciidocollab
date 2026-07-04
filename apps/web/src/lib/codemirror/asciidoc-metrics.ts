/**
 * Live document metrics: word count and estimated reading time.
 * Pure and CodeMirror-free so it unit-tests directly and can run off the typing
 * path (debounced from the editor's update listener).
 */

/** Average adult reading speed (words/minute) used for the reading-time estimate. */
export const WORDS_PER_MINUTE = 200;

/** Word count and reading-time estimate for a document. */
export interface DocumentMetrics {
  /** Number of word-like tokens (sequences containing a letter or digit). */
  words: number;
  /** Estimated reading time in whole minutes (≥1 when there is any text). */
  readingTimeMin: number;
}

// A "word" starts with a letter/number and may contain internal apostrophes/hyphens.
// Pure punctuation/markup runs (`==`, `----`, `|===`) are intentionally not counted.
const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

/** Compute word count and reading time for document text. */
export function computeMetrics(documentText: string): DocumentMetrics {
  const words = documentText.match(WORD_RE)?.length ?? 0;
  const readingTimeMin = words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
  return { words, readingTimeMin };
}
