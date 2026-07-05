/**
 * @file The find/replace query contract, shared by the pure `text-match` helper,
 * the search/replace use cases, and the structured-collaborative-editor port. It
 * lives in `types/` (not a use-case file) so a port can reference it without an
 * upward dependency on a use case. Domain-owned; never a `@asciidocollab/shared`
 * import.
 */

/** How a query string is interpreted. */
export type SearchMode = 'literal' | 'regex';

/** A find query, interpreted identically by search and by structured-apply. */
export interface SearchQuery {
  /** The literal text or the regular-expression source. */
  readonly text: string;
  /** Whether `text` is a literal or a regular expression. */
  readonly mode: SearchMode;
  /** Case-sensitive when true. */
  readonly caseSensitive: boolean;
  /** Whole-word only; ignored in regex mode (use `\b` in the pattern). */
  readonly wholeWord: boolean;
}

/** One selected match to replace, identified concurrency-robustly. */
export interface ReplaceSelection {
  /** 0-based index of the match within its file, from the search that produced it. */
  readonly ordinal: number;
  /** The exact text expected at that ordinal; a live mismatch skips it (stale). */
  readonly expectedText: string;
}

/** A positional edit ready to apply to text (or a Y.Text) left-unshifted. */
export interface PositionalEdit {
  /** Char offset where the replaced span starts (inclusive). */
  readonly from: number;
  /** Char offset where the replaced span ends (exclusive). */
  readonly to: number;
  /** The text to insert in place of `[from, to)`. */
  readonly replacement: string;
}
