import RE2 from 're2';
import { ValidationError } from '@asciidocollab/domain';
import type {
  RegexEngine,
  RegexFlags,
  MatchBudget,
  MatchSpan,
  CompiledMatcher,
  Result,
} from '@asciidocollab/domain';

/**
 * RE2-backed {@link RegexEngine} adapter.
 *
 * User-supplied patterns are untrusted input, so they run on RE2 — a
 * finite-automaton engine with a linear-time guarantee — instead of the
 * backtracking JS engine. Catastrophic backtracking is therefore structurally
 * impossible, and an invalid pattern is rejected at compile time (surfaced as a
 * `ValidationError`) rather than throwing or hanging while matching. This is the
 * same adapter the collab structured-apply uses, so search and apply match
 * identically.
 */
export class Re2RegexEngine implements RegexEngine {
  compile(pattern: string, flags: RegexFlags): Result<CompiledMatcher, ValidationError> {
    const re2Flags = `g${flags.caseSensitive ? '' : 'i'}${flags.multiline ? 'm' : ''}`;
    try {
      const compiled = new RE2(pattern, re2Flags);
      return { success: true, value: new Re2CompiledMatcher(compiled) };
    } catch (error) {
      return {
        success: false,
        error: new ValidationError(error instanceof Error ? error.message : 'Invalid regular expression'),
      };
    }
  }
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
      // Guarantee forward progress on a zero-width match.
      if (match[0].length === 0) this.regexp.lastIndex += 1;
    }
    return spans;
  }
}
