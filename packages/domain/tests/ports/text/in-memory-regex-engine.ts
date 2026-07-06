import RE2 from 're2';
import {
  RegexEngine,
  RegexFlags,
  MatchBudget,
  MatchSpan,
  CompiledMatcher,
} from '../../../src/ports/text/regex-engine';
import { Result } from '../../../src/types/result';
import { ValidationError } from '../../../src/errors/common/validation-error';

/**
 * RE2-backed {@link RegexEngine} for domain tests.
 *
 * It runs on the SAME linear-time engine (RE2) as the production `Re2RegexEngine` adapter in
 * infrastructure, so the domain tests exercise the exact matching semantics AND pattern-validity
 * rules users hit in production. A JS `RegExp` fake would diverge on both counts — it accepts
 * constructs RE2 rejects (backreferences, lookaround) and is not ReDoS-immune — which would let a
 * domain test pass on a pattern that behaves differently, or is outright rejected, in production.
 *
 * `re2` is a DEV dependency of the domain package; the domain's RUNTIME dependency graph stays
 * zero-dep (this file is test-only). The matcher deliberately mirrors the infrastructure adapter
 * line-for-line: the clean-architecture boundary forbids importing that adapter across packages
 * (domain must not depend on infrastructure), so the small amount of duplication is intentional —
 * keep the two in lockstep.
 */
export class InMemoryRegexEngine implements RegexEngine {
  compile(pattern: string, flags: RegexFlags): Result<CompiledMatcher, ValidationError> {
    const re2Flags = `g${flags.caseSensitive ? '' : 'i'}${flags.multiline ? 'm' : ''}`;
    try {
      return { success: true, value: new Re2CompiledMatcher(new RE2(pattern, re2Flags)) };
    } catch (error) {
      return {
        success: false,
        error: new ValidationError(error instanceof Error ? error.message : 'Invalid pattern'),
      };
    }
  }
}

/** Advances past a zero-width match by a full code point, so a surrogate pair is never split. */
function advancePastZeroWidth(input: string, index: number): number {
  const codePoint = input.codePointAt(index);
  return codePoint !== undefined && codePoint > 0xFF_FF ? index + 2 : index + 1;
}

class Re2CompiledMatcher implements CompiledMatcher {
  constructor(private readonly regexp: InstanceType<typeof RE2>) {}

  matches(input: string, budget: MatchBudget): MatchSpan[] {
    this.regexp.lastIndex = 0;
    const now = budget.now ?? Date.now;
    const spans: MatchSpan[] = [];
    let match: RegExpExecArray | null;
    while ((match = this.regexp.exec(input)) !== null) {
      if (spans.length >= budget.maxMatches || now() >= budget.deadline) break;
      const from = match.index;
      spans.push({
        from,
        to: from + match[0].length,
        groups: [...match],
        ...(match.groups ? { named: { ...match.groups } } : {}),
      });
      // Guarantee forward progress on a zero-width match (code-point-aware, never mid-surrogate).
      if (match[0].length === 0) this.regexp.lastIndex = advancePastZeroWidth(input, this.regexp.lastIndex);
    }
    return spans;
  }
}
