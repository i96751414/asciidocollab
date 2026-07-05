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
 * Deterministic in-memory {@link RegexEngine} for domain tests. It is backed by
 * the JS engine purely so tests can exercise real capture-group and
 * case/multiline behaviour without pulling RE2 into the domain test tree; the
 * patterns it is fed in tests are fixed and trusted, so backtracking is a
 * non-issue here. Production always uses the linear-time RE2 adapter.
 */
export class InMemoryRegexEngine implements RegexEngine {
  compile(pattern: string, flags: RegexFlags): Result<CompiledMatcher, ValidationError> {
    const jsFlags = `g${flags.caseSensitive ? '' : 'i'}${flags.multiline ? 'm' : ''}`;
    try {
      // Validate at compile time (mirrors RE2's compile-or-reject contract).
      // eslint-disable-next-line security/detect-non-literal-regexp, redos/no-vulnerable
      new RegExp(pattern, jsFlags);
    } catch (error) {
      return {
        success: false,
        error: new ValidationError(error instanceof Error ? error.message : 'Invalid pattern'),
      };
    }
    return { success: true, value: new JsCompiledMatcher(pattern, jsFlags) };
  }
}

class JsCompiledMatcher implements CompiledMatcher {
  constructor(
    private readonly pattern: string,
    private readonly jsFlags: string,
  ) {}

  matches(input: string, budget: MatchBudget): MatchSpan[] {
    // eslint-disable-next-line security/detect-non-literal-regexp, redos/no-vulnerable
    const regexp = new RegExp(this.pattern, this.jsFlags);
    const now = budget.now ?? Date.now;
    const spans: MatchSpan[] = [];
    let match: RegExpExecArray | null;
    while ((match = regexp.exec(input)) !== null) {
      if (spans.length >= budget.maxMatches || now() >= budget.deadline) break;
      const from = match.index;
      const to = from + match[0].length;
      spans.push({
        from,
        to,
        groups: [...match],
        ...(match.groups ? { named: { ...match.groups } } : {}),
      });
      // Guarantee forward progress on zero-width matches.
      if (match[0].length === 0) regexp.lastIndex += 1;
    }
    return spans;
  }
}
