import { Result } from '../../types/result';
import { ValidationError } from '../../errors/common/validation-error';

/**
 * Flags controlling how a user-supplied pattern is compiled. Deliberately small:
 * whole-word is handled by the pure literal matcher, not the engine, and the
 * regex sense of "whole word" is expressed with `\b` in the pattern itself.
 */
export interface RegexFlags {
  /** When false, matching is case-insensitive. */
  readonly caseSensitive: boolean;
  /** When true, `^`/`$` match at line boundaries (multiline mode). */
  readonly multiline: boolean;
}

/**
 * Bounds a single matching pass so no user-supplied pattern can starve the
 * process. Both bounds are hard: iteration stops as soon as either is hit.
 */
export interface MatchBudget {
  /** Stop after this many spans have been collected. */
  readonly maxMatches: number;
  /** Wall-clock timestamp (ms, same clock as `now`) after which matching stops. */
  readonly deadline: number;
  /** Clock source; defaults to `Date.now`. Injectable for deterministic tests. */
  readonly now?: () => number;
}

/** One match, with its capture groups, located in the scanned input. */
export interface MatchSpan {
  /** Char offset of the match start (inclusive). */
  readonly from: number;
  /** Char offset of the match end (exclusive). */
  readonly to: number;
  /**
   * Capture groups: index 0 is the whole match, index n is the nth group (for a
   * `$n` replacement template). A group that did not participate is `undefined`.
   */
  readonly groups: readonly (string | undefined)[];
  /** Named capture groups (for a `${name}` template), when the pattern defines any. */
  readonly named?: Readonly<Record<string, string | undefined>>;
}

/** A compiled, reusable matcher produced by {@link RegexEngine.compile}. */
export interface CompiledMatcher {
  /**
   * Returns all matches in `input`, in document order, bounded by `budget`.
   * MUST be linear-time in the length of `input` (no catastrophic backtracking).
   *
   * @param input - The text to scan.
   * @param budget - The hard bounds (max matches, deadline) on this pass.
   * @returns The matches, in document order.
   */
  matches(input: string, budget: MatchBudget): MatchSpan[];
}

/**
 * Port for compiling and running user-supplied regular expressions.
 *
 * User patterns are untrusted input, so implementations MUST use a linear-time
 * engine (RE2) — never a backtracking engine — and MUST reject an invalid
 * pattern at compile time (surfaced as a `ValidationError`) rather than
 * throwing or hanging while matching. The domain stays engine-agnostic and
 * zero-dependency: the concrete RE2 adapter lives in infrastructure, and a
 * deterministic in-memory fake backs the domain tests.
 */
export interface RegexEngine {
  /**
   * Compiles `pattern` under `flags`.
   *
   * @param pattern - The user-supplied regular-expression source.
   * @param flags - Case/multiline options.
   * @returns A reusable matcher on success, or a `ValidationError` when the
   *   pattern is invalid (the caller surfaces this as an inline error and never
   *   runs anything).
   */
  compile(pattern: string, flags: RegexFlags): Result<CompiledMatcher, ValidationError>;
}
