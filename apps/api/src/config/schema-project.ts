import type convict from 'convict';

/** Project-scoped rate limiting configuration. */
export interface ProjectConfig {
  /** Set-main-file rate limiting configuration. */
  mainFile: {
    /** Maximum set-main-file requests per user/IP per window. */
    rateLimitMax: number;
    /** Set-main-file rate limit window in milliseconds. */
    rateLimitWindow: number;
  };
  /** Cross-file refactoring (find-usages/rename-symbol) rate limiting configuration. */
  refactoring: {
    /** Maximum refactoring requests per user/IP per window. */
    rateLimitMax: number;
    /** Refactoring rate limit window in milliseconds. */
    rateLimitWindow: number;
  };
}

/** Convict schema fragment for the project-scoped (main-file, refactoring) domain. */
export const projectSchema: convict.Schema<ProjectConfig> = {
  mainFile: {
    rateLimitMax: {
      doc: 'Maximum set-main-file requests per user/IP per window.',
      format: 'integer',
      default: 50,
      env: 'ASCIIDOCOLLAB_PROJECT_MAIN_FILE_RATE_LIMIT_MAX',
    },
    rateLimitWindow: {
      doc: 'Set-main-file rate limit window in milliseconds.',
      format: 'integer',
      default: 3_600_000,
      env: 'ASCIIDOCOLLAB_PROJECT_MAIN_FILE_RATE_LIMIT_WINDOW',
    },
  },
  refactoring: {
    rateLimitMax: {
      doc: 'Maximum cross-file refactoring requests (find-usages/rename-symbol) per user/IP per window.',
      format: 'integer',
      default: 60,
      env: 'ASCIIDOCOLLAB_PROJECT_REFACTORING_RATE_LIMIT_MAX',
    },
    rateLimitWindow: {
      doc: 'Refactoring rate limit window in milliseconds.',
      format: 'integer',
      default: 3_600_000,
      env: 'ASCIIDOCOLLAB_PROJECT_REFACTORING_RATE_LIMIT_WINDOW',
    },
  },
};
