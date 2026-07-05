import { Result } from '../../types/result';
import { ValidationError } from '../../errors/common/validation-error';
import { RegexEngine, MatchBudget, MatchSpan } from '../../ports/text/regex-engine';
import { SearchQuery, SearchMode, ReplaceSelection, PositionalEdit } from '../../types/search';

/**
 * Single source of truth for find/replace match semantics, shared by the
 * project-wide search use case and the collaborative structured-apply so the two
 * can never diverge (mirrors the role of `content-replacements.ts` for rename).
 *
 * Literal and whole-word matching are pure and need no engine. A regex query is
 * matched through the injected {@link RegexEngine} port (RE2 in production),
 * never a backtracking engine, because the pattern is untrusted input.
 */

export type { SearchQuery, SearchMode, ReplaceSelection, PositionalEdit } from '../../types/search';

const WORD_CHAR = /[A-Za-z0-9_]/;

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && WORD_CHAR.test(char);
}

function isWholeWordAt(content: string, from: number, to: number): boolean {
  const before = from > 0 ? content[from - 1] : undefined;
  const after = to < content.length ? content[to] : undefined;
  return !isWordChar(before) && !isWordChar(after);
}

function pushLiteralMatch(spans: MatchSpan[], content: string, query: SearchQuery, from: number, to: number): void {
  if (!query.wholeWord || isWholeWordAt(content, from, to)) {
    spans.push({ from, to, groups: [content.slice(from, to)] });
  }
}

function literalMatches(content: string, query: SearchQuery, budget: MatchBudget): MatchSpan[] {
  const needle = query.text;
  if (needle.length === 0) return [];
  const now = budget.now ?? Date.now;
  const spans: MatchSpan[] = [];

  if (query.caseSensitive) {
    // Fast path — `indexOf` reports offsets in the original string, so they are exact.
    let from = 0;
    for (;;) {
      if (spans.length >= budget.maxMatches || now() >= budget.deadline) break;
      const index = content.indexOf(needle, from);
      if (index === -1) break;
      const end = index + needle.length;
      pushLiteralMatch(spans, content, query, index, end);
      from = end;
    }
    return spans;
  }

  // Case-insensitive — compare a same-length window of the ORIGINAL content against the folded
  // needle. Lowercasing the whole haystack (`content.toLowerCase()`) and using its index would
  // shift every offset after a code point whose lower-case form has a different length (e.g. `İ`),
  // corrupting span offsets — and thus the eventual replace splice. Comparing in place keeps offsets
  // exact (a length-changing code point simply fails to match, which is acceptable for literal mode).
  const lowerNeedle = needle.toLowerCase();
  const lowerFirst = lowerNeedle[0];
  const needleLength = needle.length;
  for (let index = 0; index + needleLength <= content.length; ) {
    if (spans.length >= budget.maxMatches || now() >= budget.deadline) break;
    if (content[index].toLowerCase() !== lowerFirst) {
      index += 1;
      continue;
    }
    if (content.slice(index, index + needleLength).toLowerCase() === lowerNeedle) {
      const end = index + needleLength;
      pushLiteralMatch(spans, content, query, index, end);
      index = end;
    } else {
      index += 1;
    }
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
 * numbered groups, and `${name}` named groups. A reference to a group the
 * pattern does not define is emitted **literally** (matching the JS/VS Code
 * find-replace convention), so a `$`-and-digits string like `$100` and named
 * placeholders survive when they are not capture references.
 */
export function substitute(replacement: string, span: MatchSpan, mode: SearchMode): string {
  if (mode === 'literal') return replacement;
  let out = '';
  let index = 0;
  while (index < replacement.length) {
    const char = replacement[index];
    if (char !== '$') {
      out += char;
      index += 1;
      continue;
    }
    const next = replacement[index + 1];
    if (next === '$') {
      out += '$';
      index += 2;
      continue;
    }
    if (next === '&') {
      out += span.groups[0] ?? '';
      index += 2;
      continue;
    }
    if (next === '{') {
      const close = replacement.indexOf('}', index + 2);
      if (close !== -1) {
        const name = replacement.slice(index + 2, close);
        // A known named group expands; anything else keeps the token verbatim.
        out += span.named && name in span.named ? (span.named[name] ?? '') : replacement.slice(index, close + 1);
        index = close + 1;
        continue;
      }
    }
    if (isDigit(next)) {
      const twoDigit = replacement.slice(index + 1, index + 3);
      if (/^\d\d$/.test(twoDigit)) {
        const twoNumber = Number.parseInt(twoDigit, 10);
        if (twoNumber > 0 && twoNumber < span.groups.length) {
          out += span.groups[twoNumber] ?? '';
          index += 3;
          continue;
        }
      }
      const oneNumber = Number.parseInt(next, 10);
      // A valid group expands; an absent one emits `$` + the digit literally.
      out += oneNumber > 0 && oneNumber < span.groups.length ? (span.groups[oneNumber] ?? '') : `$${next}`;
      index += 2;
      continue;
    }
    // A lone `$` not followed by a recognised token is a literal dollar sign.
    out += '$';
    index += 1;
  }
  return out;
}

/**
 * Filters freshly-computed `spans` to the confirmed `selections`, skipping any
 * whose live text no longer equals `expectedText` (stale), and returns
 * right-to-left positional edits so applying them never invalidates a
 * not-yet-applied offset. Selections are de-duplicated by ordinal so a repeated
 * ordinal cannot produce two overlapping edits on the same span.
 */
export function selectSpans(
  spans: readonly MatchSpan[],
  selections: readonly ReplaceSelection[],
  replacement: string,
  mode: SearchMode,
): PositionalEdit[] {
  const edits: PositionalEdit[] = [];
  const seen = new Set<number>();
  for (const selection of selections) {
    if (seen.has(selection.ordinal)) continue;
    seen.add(selection.ordinal);
    const span = spans[selection.ordinal];
    if (!span) continue;
    if ((span.groups[0] ?? '') !== selection.expectedText) continue;
    edits.push({ from: span.from, to: span.to, replacement: substitute(replacement, span, mode) });
  }
  edits.sort((a, b) => b.from - a.from);
  return edits;
}
