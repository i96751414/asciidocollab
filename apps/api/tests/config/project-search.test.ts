import { createConfig } from '../../src/config/schema';

/**
 * The project-wide find/replace routes fan out over every file, so their
 * budgets and rate limits MUST be config-driven (no hardcoded literals) and
 * overridable per deployment. These tests pin the schema defaults and the
 * ASCIIDOCOLLAB_PROJECT_SEARCH_* environment bindings.
 */
describe('project.search config', () => {
  const searchEnvironmentKeys = [
    'ASCIIDOCOLLAB_PROJECT_SEARCH_RATE_LIMIT_MAX',
    'ASCIIDOCOLLAB_PROJECT_SEARCH_RATE_LIMIT_WINDOW',
    'ASCIIDOCOLLAB_PROJECT_SEARCH_REPLACE_RATE_LIMIT_MAX',
    'ASCIIDOCOLLAB_PROJECT_SEARCH_REPLACE_RATE_LIMIT_WINDOW',
    'ASCIIDOCOLLAB_PROJECT_SEARCH_MAX_MATCHES_RETURNED',
    'ASCIIDOCOLLAB_PROJECT_SEARCH_MAX_PATTERN_LENGTH',
    'ASCIIDOCOLLAB_PROJECT_SEARCH_PER_FILE_TIME_BUDGET_MS',
    'ASCIIDOCOLLAB_PROJECT_SEARCH_MAX_FILE_BYTES',
  ] as const;

  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of searchEnvironmentKeys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of searchEnvironmentKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('exposes documented defaults (read-higher, write-conservative)', () => {
    const search = createConfig().get('project.search');
    expect(search).toEqual({
      rateLimitMax: 120,
      rateLimitWindow: 3_600_000,
      replaceRateLimitMax: 30,
      replaceRateLimitWindow: 3_600_000,
      maxMatchesReturned: 1000,
      maxPatternLength: 1000,
      perFileTimeBudgetMs: 250,
      maxFileBytes: 2_000_000,
    });
  });

  it('binds every budget to its ASCIIDOCOLLAB_PROJECT_SEARCH_* env var', () => {
    process.env.ASCIIDOCOLLAB_PROJECT_SEARCH_RATE_LIMIT_MAX = '7';
    process.env.ASCIIDOCOLLAB_PROJECT_SEARCH_RATE_LIMIT_WINDOW = '11';
    process.env.ASCIIDOCOLLAB_PROJECT_SEARCH_REPLACE_RATE_LIMIT_MAX = '13';
    process.env.ASCIIDOCOLLAB_PROJECT_SEARCH_REPLACE_RATE_LIMIT_WINDOW = '17';
    process.env.ASCIIDOCOLLAB_PROJECT_SEARCH_MAX_MATCHES_RETURNED = '19';
    process.env.ASCIIDOCOLLAB_PROJECT_SEARCH_MAX_PATTERN_LENGTH = '23';
    process.env.ASCIIDOCOLLAB_PROJECT_SEARCH_PER_FILE_TIME_BUDGET_MS = '29';
    process.env.ASCIIDOCOLLAB_PROJECT_SEARCH_MAX_FILE_BYTES = '31';

    const search = createConfig().get('project.search');
    expect(search).toEqual({
      rateLimitMax: 7,
      rateLimitWindow: 11,
      replaceRateLimitMax: 13,
      replaceRateLimitWindow: 17,
      maxMatchesReturned: 19,
      maxPatternLength: 23,
      perFileTimeBudgetMs: 29,
      maxFileBytes: 31,
    });
  });
});
