import { Result } from '../../types/result';
import { ValidationError } from '../../errors/common/validation-error';
import { RegexEngine, MatchBudget, MatchSpan } from '../../ports/text/regex-engine';

/**
 * Single source of truth for find/replace match semantics, shared by the
 * project-wide search use case and the collaborative structured-apply so the two
 * can never diverge (mirrors the role of `content-replacements.ts` for rename).
 *
 * Literal and whole-word matching are pure and need no engine. A regex query is
 * matched through the injected {@link RegexEngine} port (RE2 in production),
 * never a backtracking engine, because the pattern is untrusted input.
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

const WORD_CHAR = /[A-Za-z0-9_]/;

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && WORD_CHAR.test(char);
}

function isWholeWordAt(content: string, from: number, to: number): boolean {
  const before = from > 0 ? content[from - 1] : undefined;
  const after = to < content.length ? content[to] : undefined;
  return !isWordChar(before) && !isWordChar(after);
}

function literalMatches(
  content: string,
  query: SearchQuery,
  budget: MatchBudget,
): MatchSpan[] {
  if (query.text.length === 0) return [];
  // Case-insensitive literal search lowercases both sides. For the vast majority
  // of text this preserves offsets; the handful of code points that change
  // length under case folding are out of scope for literal mode (use regex).
  const haystack = query.caseSensitive ? content : content.toLowerCase();
  const needle = query.caseSensitive ? query.text : query.text.toLowerCase();
  const now = budget.now ?? Date.now;
  const spans: MatchSpan[] = [];
  let from = 0;
  for (;;) {
    if (spans.length >= budget.maxMatches || now() >= budget.deadline) break;
    const index = haystack.indexOf(needle, from);
    if (index === -1) break;
    const end = index + needle.length;
    if (!query.wholeWord || isWholeWordAt(content, index, end)) {
      spans.push({ from: index, to: end, groups: [content.slice(index, end)] });
    }
    from = end;
  }
  return spans;
}

/**
 * Computes all match spans of `query` in `content`, bounded by `budget`. Regex
 * mode requires `engine`; an invalid pattern yields a `ValidationError` and
 * nothing runs.
 */
export function computeMatches(
  content: string,
  query: SearchQuery,
  engine: RegexEngine | undefined,
  budget: MatchBudget,
): Result<MatchSpan[], ValidationError> {
  if (query.mode === 'literal') {
    return { success: true, value: literalMatches(content, query, budget) };
  }
  if (!engine) {
    return { success: false, error: new ValidationError('A regex engine is required for regex mode') };
  }
  const compiled = engine.compile(query.text, {
    caseSensitive: query.caseSensitive,
    multiline: true,
  });
  if (!compiled.success) return compiled;
  return { success: true, value: compiled.value.matches(content, budget) };
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

/**
 * Expands a replacement against one match. Literal mode inserts `replacement`
 * verbatim. Regex mode supports `$$` (literal `$`), `$&` (whole match), `$1`
 * numbered groups, and `${name}` named groups, rejecting any reference to a
 * group the pattern does not define (FR-006d).
 */
export function substitute(
  replacement: string,
  span: MatchSpan,
  mode: SearchMode,
): Result<string, ValidationError> {
  if (mode === 'literal') return { success: true, value: replacement };
  let out = '';
  let i = 0;
  while (i < replacement.length) {
    const char = replacement[i];
    if (char !== '$') {
      out += char;
      i += 1;
      continue;
    }
    const next = replacement[i + 1];
    if (next === '$') {
      out += '$';
      i += 2;
      continue;
    }
    if (next === '&') {
      out += span.groups[0] ?? '';
      i += 2;
      continue;
    }
    if (next === '{') {
      const close = replacement.indexOf('}', i + 2);
      if (close !== -1) {
        const name = replacement.slice(i + 2, close);
        if (!span.named || !(name in span.named)) {
          return { success: false, error: new ValidationError(`Replacement references unknown capture group \${${name}}`) };
        }
        out += span.named[name] ?? '';
        i = close + 1;
        continue;
      }
    }
    if (isDigit(next)) {
      const twoDigit = replacement.slice(i + 1, i + 3);
      if (/^\d\d$/.test(twoDigit)) {
        const twoNumber = Number.parseInt(twoDigit, 10);
        if (twoNumber > 0 && twoNumber < span.groups.length) {
          out += span.groups[twoNumber] ?? '';
          i += 3;
          continue;
        }
      }
      const oneNumber = Number.parseInt(next, 10);
      if (oneNumber > 0 && oneNumber < span.groups.length) {
        out += span.groups[oneNumber] ?? '';
        i += 2;
        continue;
      }
      return { success: false, error: new ValidationError(`Replacement references absent capture group $${next}`) };
    }
    // A lone `$` not followed by a recognised token is a literal dollar sign.
    out += '$';
    i += 1;
  }
  return { success: true, value: out };
}

/**
 * Filters freshly-computed `spans` to the confirmed `selections`, skipping any
 * whose live text no longer equals `expectedText` (stale — FR-017), and returns
 * right-to-left positional edits so applying them never invalidates a
 * not-yet-applied offset.
 */
export function selectSpans(
  spans: readonly MatchSpan[],
  selections: readonly ReplaceSelection[],
  replacement: string,
  mode: SearchMode,
): Result<PositionalEdit[], ValidationError> {
  const edits: PositionalEdit[] = [];
  for (const selection of selections) {
    const span = spans[selection.ordinal];
    if (!span) continue;
    if ((span.groups[0] ?? '') !== selection.expectedText) continue;
    const substituted = substitute(replacement, span, mode);
    if (!substituted.success) return substituted;
    edits.push({ from: span.from, to: span.to, replacement: substituted.value });
  }
  edits.sort((a, b) => b.from - a.from);
  return { success: true, value: edits };
}
