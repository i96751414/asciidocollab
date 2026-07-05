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
        if (!span.named || !(name in span.named)) {
          return { success: false, error: new ValidationError(`Replacement references unknown capture group \${${name}}`) };
        }
        out += span.named[name] ?? '';
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
      if (oneNumber > 0 && oneNumber < span.groups.length) {
        out += span.groups[oneNumber] ?? '';
        index += 2;
        continue;
      }
      return { success: false, error: new ValidationError(`Replacement references absent capture group $${next}`) };
    }
    // A lone `$` not followed by a recognised token is a literal dollar sign.
    out += '$';
    index += 1;
  }
  return { success: true, value: out };
}

/**
 * Validates a replacement template up front (before any match), so an invalid
 * capture-group reference is rejected as `INVALID_REPLACEMENT` even when no file
 * currently matches (FR-006d). Literal mode inserts the text verbatim, so it is
 * always valid. Regex mode checks every `$n`/`${name}` against the pattern's
 * group count and names.
 *
 * @param replacement - The `$n`/`${name}` template to expand at apply time.
 * @param mode - Literal or regex.
 * @param groupCount - Number of numbered capture groups the pattern defines.
 * @param groupNames - Named capture groups the pattern defines.
 * @returns Ok when valid, or a `ValidationError` naming the offending reference.
 */
export function validateReplacementTemplate(
  replacement: string,
  mode: SearchMode,
  groupCount: number,
  groupNames: readonly string[],
): Result<void, ValidationError> {
  if (mode === 'literal') return { success: true, value: undefined };
  let index = 0;
  while (index < replacement.length) {
    if (replacement[index] !== '$') {
      index += 1;
      continue;
    }
    const next = replacement[index + 1];
    if (next === '$' || next === '&') {
      index += 2;
      continue;
    }
    if (next === '{') {
      const close = replacement.indexOf('}', index + 2);
      if (close !== -1) {
        const name = replacement.slice(index + 2, close);
        if (!groupNames.includes(name)) {
          return { success: false, error: new ValidationError(`Replacement references unknown capture group \${${name}}`) };
        }
        index = close + 1;
        continue;
      }
    }
    if (isDigit(next)) {
      const twoDigit = replacement.slice(index + 1, index + 3);
      if (/^\d\d$/.test(twoDigit) && Number.parseInt(twoDigit, 10) > 0 && Number.parseInt(twoDigit, 10) <= groupCount) {
        index += 3;
        continue;
      }
      const oneNumber = Number.parseInt(next, 10);
      if (oneNumber > 0 && oneNumber <= groupCount) {
        index += 2;
        continue;
      }
      return { success: false, error: new ValidationError(`Replacement references absent capture group $${next}`) };
    }
    index += 1;
  }
  return { success: true, value: undefined };
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
