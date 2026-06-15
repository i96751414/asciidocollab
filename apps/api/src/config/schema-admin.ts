import type convict from 'convict';

/** Admin endpoint rate limiting configuration. */
export interface AdminConfig {
  /** Admin invite rate limiting configuration. */
  invite: {
    /** Maximum admin invite requests per IP per window. */
    rateLimitMax: number;
    /** Admin invite rate limit window in milliseconds. */
    rateLimitWindow: number;
  };
  /** Open registration rate limiting configuration. */
  openRegistration: {
    /** Maximum open registration status requests per IP per window. */
    rateLimitMax: number;
    /** Open registration rate limit window in milliseconds. */
    rateLimitWindow: number;
  };
  /** Audit log rate limiting configuration. */
  auditLog: {
    /** Maximum audit log requests per IP per window. */
    rateLimitMax: number;
    /** Audit log rate limit window in milliseconds. */
    rateLimitWindow: number;
  };
}

/** Failed sign-in telemetry configuration. */
export interface FailedSignInConfig {
  /** Days to retain failed sign-in telemetry before purge. */
  retentionDays: number;
  /** Coalescing window in minutes (must be >= 1). */
  coalesceWindowMinutes: number;
  /** Scheduled purge interval in hours. */
  purgeIntervalHours: number;
  /** Maximum failed sign-in review requests per IP per window. */
  rateLimitMax: number;
  /** Failed sign-in review rate limit window in milliseconds. */
  rateLimitWindow: number;
}

/** Convict schema fragment for the admin endpoint domain. */
export const adminSchema: convict.Schema<AdminConfig> = {
  invite: {
    rateLimitMax: {
      doc: 'Maximum admin invite requests per IP per window.',
      format: 'integer',
      default: 10,
      env: 'ASCIIDOCOLLAB_ADMIN_INVITE_RATE_LIMIT_MAX',
    },
    rateLimitWindow: {
      doc: 'Admin invite rate limit window in milliseconds.',
      format: 'integer',
      default: 3_600_000,
      env: 'ASCIIDOCOLLAB_ADMIN_INVITE_RATE_LIMIT_WINDOW',
    },
  },
  openRegistration: {
    rateLimitMax: {
      doc: 'Maximum open registration status requests per IP per window.',
      format: 'integer',
      default: 60,
      env: 'ASCIIDOCOLLAB_ADMIN_OPEN_REGISTRATION_RATE_LIMIT_MAX',
    },
    rateLimitWindow: {
      doc: 'Open registration status rate limit window in milliseconds.',
      format: 'integer',
      default: 60_000,
      env: 'ASCIIDOCOLLAB_ADMIN_OPEN_REGISTRATION_RATE_LIMIT_WINDOW',
    },
  },
  auditLog: {
    rateLimitMax: {
      doc: 'Maximum audit log requests per IP per window.',
      format: 'integer',
      default: 120,
      env: 'ASCIIDOCOLLAB_ADMIN_AUDIT_LOG_RATE_LIMIT_MAX',
    },
    rateLimitWindow: {
      doc: 'Audit log rate limit window in milliseconds.',
      format: 'integer',
      default: 60_000,
      env: 'ASCIIDOCOLLAB_ADMIN_AUDIT_LOG_RATE_LIMIT_WINDOW',
    },
  },
};

/** Convict schema fragment for the failed sign-in telemetry domain. */
export const failedSignInSchema: convict.Schema<FailedSignInConfig> = {
  retentionDays: {
    doc: 'Days to retain auth-attempt telemetry (failed sign-ins and password-reset requests) before it is purged.',
    format: 'positive-int',
    default: 90,
    env: 'ASCIIDOCOLLAB_FAILED_SIGN_IN_RETENTION_DAYS',
  },
  coalesceWindowMinutes: {
    doc: 'Tumbling window (minutes) over which repeated auth attempts coalesce into one bucket. Must be >= 1.',
    format: 'positive-int',
    default: 60,
    env: 'ASCIIDOCOLLAB_FAILED_SIGN_IN_COALESCE_WINDOW_MINUTES',
  },
  purgeIntervalHours: {
    doc: 'How often (hours) the scheduled purge of expired auth-attempt telemetry runs.',
    format: 'positive-int',
    default: 24,
    env: 'ASCIIDOCOLLAB_FAILED_SIGN_IN_PURGE_INTERVAL_HOURS',
  },
  rateLimitMax: {
    doc: 'Maximum failed sign-in review (admin) requests per IP per window.',
    format: 'integer',
    default: 120,
    env: 'ASCIIDOCOLLAB_FAILED_SIGN_IN_RATE_LIMIT_MAX',
  },
  rateLimitWindow: {
    doc: 'Failed sign-in review rate limit window in milliseconds.',
    format: 'integer',
    default: 60_000,
    env: 'ASCIIDOCOLLAB_FAILED_SIGN_IN_RATE_LIMIT_WINDOW',
  },
};
