import convict from 'convict';
import './formats';

/**
 * Convict schema definition for AsciiDoCollab API server.
 *
 * Single source of truth for all configuration fields.
 * Each field maps to an environment variable for override.
 * Fields marked `sensitive: true` are redacted in logs/output.
 */
/**
 * Creates a new convict configuration instance.
 *
 * Must be called after environment variables are set, because convict
 * reads env vars at construction time.
 *
 * @returns A new convict configuration instance.
 */
export function createConfig() {
  return convict({
    env: {
    doc: 'The application environment.',
    format: ['production', 'development', 'test'],
    default: 'production',
    env: 'NODE_ENV',
  },
  api: {
    port: {
      doc: 'Port to bind the HTTP server.',
      format: 'port',
      default: 4000,
      env: 'ASCIIDOCOLLAB_API_PORT',
    },
    host: {
      doc: 'Host to bind the HTTP server.',
      format: 'hostname',
      default: '0.0.0.0',
      env: 'ASCIIDOCOLLAB_API_HOST',
    },
    trustProxy: {
      doc: 'Trust X-Forwarded-For headers from reverse proxy.',
      format: Boolean,
      default: false,
      env: 'ASCIIDOCOLLAB_API_TRUST_PROXY',
    },
    corsOrigins: {
      doc: 'Comma-separated list of allowed CORS origins. Empty string disables CORS.',
      format: String,
      default: '',
      env: 'ASCIIDOCOLLAB_API_CORS_ORIGINS',
    },
    frontendUrl: {
      doc: 'Base URL for frontend (used in password reset links).',
      format: String,
      default: 'https://asciidocollab.example.com',
      env: 'ASCIIDOCOLLAB_API_FRONTEND_URL',
    },
    httpsRedirect: {
      doc: 'Enable HTTP to HTTPS redirect.',
      format: Boolean,
      default: false,
      env: 'ASCIIDOCOLLAB_API_HTTPS_REDIRECT',
    },
  },
  auth: {
    session: {
      secret: {
        doc: 'Secret for signing session cookies. Must be set via environment variable.',
        format: 'required-string',
        default: null,
        nullable: true,
        sensitive: true,
        env: 'ASCIIDOCOLLAB_AUTH_SESSION_SECRET',
      },
      maxAge: {
        doc: 'Session inactivity timeout in milliseconds.',
        format: 'integer',
        default: 1_800_000,
        env: 'ASCIIDOCOLLAB_AUTH_SESSION_MAX_AGE',
      },
      absoluteMaxAge: {
        doc: 'Absolute maximum session lifetime in milliseconds.',
        format: 'integer',
        default: 86_400_000,
        env: 'ASCIIDOCOLLAB_AUTH_SESSION_ABSOLUTE_MAX_AGE',
      },
      secure: {
        doc: 'Set the secure flag on session cookies (requires HTTPS).',
        format: Boolean,
        default: true,
        env: 'ASCIIDOCOLLAB_AUTH_COOKIE_SECURE',
      },
      encryptionKey: {
        doc: 'AES-256 key for session data encryption at rest. Must be set via environment variable.',
        format: 'required-string',
        default: '',
        sensitive: true,
        env: 'ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY',
      },
      cookie: {
        httpOnly: {
          doc: 'Set the HttpOnly flag on session cookies.',
          format: Boolean,
          default: true,
        },
        sameSite: {
          doc: 'Set the SameSite attribute on session cookies.',
          format: ['strict', 'lax', 'none'],
          default: 'strict',
        },
        saveUninitialized: {
          doc: 'Save uninitialized sessions to the store.',
          format: Boolean,
          default: false,
        },
        rolling: {
          doc: 'Renew session on every request (sliding expiration).',
          format: Boolean,
          default: true,
        },
      },
    },
    password: {
      minLength: {
        doc: 'Minimum password length.',
        format: 'integer',
        default: 12,
        env: 'ASCIIDOCOLLAB_AUTH_PASSWORD_MIN_LENGTH',
      },
      requireUppercase: {
        doc: 'Require at least one uppercase letter in passwords.',
        format: Boolean,
        default: true,
        env: 'ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_UPPERCASE',
      },
      requireLowercase: {
        doc: 'Require at least one lowercase letter in passwords.',
        format: Boolean,
        default: true,
        env: 'ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_LOWERCASE',
      },
      requireDigits: {
        doc: 'Require at least one digit in passwords.',
        format: Boolean,
        default: true,
        env: 'ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_DIGITS',
      },
      requireSymbols: {
        doc: 'Require at least one symbol in passwords.',
        format: Boolean,
        default: true,
        env: 'ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_SYMBOLS',
      },
      historyDepth: {
        doc: 'Number of previous passwords to remember for reuse prevention.',
        format: 'integer',
        default: 5,
        env: 'ASCIIDOCOLLAB_AUTH_PASSWORD_HISTORY_DEPTH',
      },
      hashMemory: {
        doc: 'Argon2id memory cost in KiB.',
        format: 'integer',
        default: 65_536,
        env: 'ASCIIDOCOLLAB_AUTH_PASSWORD_HASH_MEMORY',
      },
      hashTime: {
        doc: 'Argon2id time cost (number of iterations).',
        format: 'integer',
        default: 3,
        env: 'ASCIIDOCOLLAB_AUTH_PASSWORD_HASH_TIME',
      },
      hashParallelism: {
        doc: 'Argon2id parallelism degree.',
        format: 'integer',
        default: 1,
        env: 'ASCIIDOCOLLAB_AUTH_PASSWORD_HASH_PARALLELISM',
      },
    },
    login: {
      rateLimitMax: {
        doc: 'Maximum failed login attempts before lockout.',
        format: 'integer',
        default: 5,
        env: 'ASCIIDOCOLLAB_AUTH_LOGIN_RATE_LIMIT_MAX',
      },
      rateLimitWindow: {
        doc: 'Login rate limit window in milliseconds.',
        format: 'integer',
        default: 900_000,
        env: 'ASCIIDOCOLLAB_AUTH_LOGIN_RATE_LIMIT_WINDOW',
      },
      lockoutDuration: {
        doc: 'Account lockout duration in milliseconds.',
        format: 'integer',
        default: 900_000,
        env: 'ASCIIDOCOLLAB_AUTH_LOGIN_LOCKOUT_DURATION',
      },
    },
    registration: {
      rateLimitMax: {
        doc: 'Maximum registrations per IP per window.',
        format: 'integer',
        default: 3,
        env: 'ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_MAX',
      },
      rateLimitWindow: {
        doc: 'Registration rate limit window in milliseconds.',
        format: 'integer',
        default: 3_600_000,
        env: 'ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_WINDOW',
      },
    },
    passwordReset: {
      tokenExpiry: {
        doc: 'Password reset token expiration in milliseconds.',
        format: 'integer',
        default: 3_600_000,
        env: 'ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_TOKEN_EXPIRY',
      },
      tokenByteLength: {
        doc: 'Number of random bytes for password reset token generation.',
        format: 'integer',
        default: 32,
      },
      rateLimitMax: {
        doc: 'Maximum password reset requests per IP per window.',
        format: 'integer',
        default: 3,
        env: 'ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_MAX',
      },
      rateLimitWindow: {
        doc: 'Password reset rate limit window in milliseconds.',
        format: 'integer',
        default: 3_600_000,
        env: 'ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_WINDOW',
      },
    },
    passwordChange: {
      rateLimitMax: {
        doc: 'Maximum password change requests per user per window.',
        format: 'integer',
        default: 5,
        env: 'ASCIIDOCOLLAB_AUTH_PASSWORD_CHANGE_RATE_LIMIT_MAX',
      },
      rateLimitWindow: {
        doc: 'Password change rate limit window in milliseconds.',
        format: 'integer',
        default: 900_000,
        env: 'ASCIIDOCOLLAB_AUTH_PASSWORD_CHANGE_RATE_LIMIT_WINDOW',
      },
    },
    emailConfirm: {
      rateLimitMax: {
        doc: 'Maximum email confirmation attempts per IP per window.',
        format: 'integer',
        default: 10,
        env: 'ASCIIDOCOLLAB_AUTH_EMAIL_CONFIRM_RATE_LIMIT_MAX',
      },
      rateLimitWindow: {
        doc: 'Email confirmation rate limit window in milliseconds.',
        format: 'integer',
        default: 3_600_000,
        env: 'ASCIIDOCOLLAB_AUTH_EMAIL_CONFIRM_RATE_LIMIT_WINDOW',
      },
    },
    emailChangeRequest: {
      rateLimitMax: {
        doc: 'Maximum email change requests per IP per window.',
        format: 'integer',
        default: 5,
        env: 'ASCIIDOCOLLAB_AUTH_EMAIL_CHANGE_REQUEST_RATE_LIMIT_MAX',
      },
      rateLimitWindow: {
        doc: 'Email change request rate limit window in milliseconds.',
        format: 'integer',
        default: 3_600_000,
        env: 'ASCIIDOCOLLAB_AUTH_EMAIL_CHANGE_REQUEST_RATE_LIMIT_WINDOW',
      },
    },
    userSearch: {
      rateLimitMax: {
        doc: 'Maximum user search requests per IP per window.',
        format: 'integer',
        default: 30,
        env: 'ASCIIDOCOLLAB_AUTH_USER_SEARCH_RATE_LIMIT_MAX',
      },
      rateLimitWindow: {
        doc: 'User search rate limit window in milliseconds.',
        format: 'integer',
        default: 60_000,
        env: 'ASCIIDOCOLLAB_AUTH_USER_SEARCH_RATE_LIMIT_WINDOW',
      },
    },
    breachCheck: {
      hibpApiUrl: {
        doc: 'HIBP API base URL for password breach checking.',
        format: String,
        default: 'https://api.pwnedpasswords.com/range',
      },
    },
    email: {
      enabled: {
        doc: 'Enable or disable email sending. When disabled, no emails are sent but breach checks still run.',
        format: Boolean,
        default: true,
        env: 'ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED',
      },
      provider: {
        doc: 'Email provider type (smtp, sendgrid, ses).',
        format: ['smtp', 'sendgrid', 'ses'],
        default: 'smtp',
        env: 'ASCIIDOCOLLAB_AUTH_EMAIL_PROVIDER',
      },
      smtpHost: {
        doc: 'SMTP server host.',
        format: String,
        default: '',
        env: 'ASCIIDOCOLLAB_AUTH_SMTP_HOST',
      },
      smtpPort: {
        doc: 'SMTP server port.',
        format: 'integer',
        default: 587,
        env: 'ASCIIDOCOLLAB_AUTH_SMTP_PORT',
      },
      smtpUser: {
        doc: 'SMTP authentication user.',
        format: String,
        default: '',
        env: 'ASCIIDOCOLLAB_AUTH_SMTP_USER',
      },
      smtpPassword: {
        doc: 'SMTP authentication password.',
        format: String,
        default: '',
        sensitive: true,
        env: 'ASCIIDOCOLLAB_AUTH_SMTP_PASSWORD',
      },
      sendgridApiKey: {
        doc: 'SendGrid API key.',
        format: String,
        default: '',
        sensitive: true,
        env: 'ASCIIDOCOLLAB_AUTH_SENDGRID_API_KEY',
      },
      sesRegion: {
        doc: 'AWS SES region.',
        format: String,
        default: '',
        env: 'ASCIIDOCOLLAB_AUTH_SES_REGION',
      },
      from: {
        doc: 'From address for transactional emails.',
        format: 'required-string',
        default: null,
        nullable: true,
        env: 'ASCIIDOCOLLAB_AUTH_EMAIL_FROM',
      },
      templates: {
        resetRequest: {
          subject: {
            doc: 'Subject line for password reset request email.',
            format: String,
            default: '[ASCIIDOCOLLAB] Password Reset Request',
          },
          html: {
            doc: 'HTML body for password reset request email. Use {token} and {frontendUrl} placeholders.',
            format: String,
            default: '<p>Click <a href="{frontendUrl}/reset-password?token={token}">here</a> to reset your password.</p>',
          },
        },
        passwordChanged: {
          subject: {
            doc: 'Subject line for password changed notification email.',
            format: String,
            default: '[ASCIIDOCOLLAB] Password Changed',
          },
          html: {
            doc: 'HTML body for password changed notification email.',
            format: String,
            default: '<p>Your password has been changed. If you did not make this change, please contact support immediately.</p>',
          },
        },
        emailChangeRequest: {
          subject: {
            doc: 'Subject line for email change confirmation email.',
            format: String,
            default: '[ASCIIDOCOLLAB] Confirm your email address change',
          },
          html: {
            doc: 'HTML body for email change confirmation email. Use {token} and {frontendUrl} placeholders.',
            format: String,
            default: '<p>Click <a href="{frontendUrl}/email-confirm?token={token}">here</a> to confirm your new email address.</p>',
          },
        },
      },
    },
  },
  });
}

/**
 * The validated configuration type.
 * Defines the shape manually to ensure type safety.
 */
export interface Config {
  /** The application environment. */
  env: string;
  /** API server configuration. */
  api: {
    /** Port to bind the HTTP server. */
    port: number;
    /** Host to bind the HTTP server. */
    host: string;
    /** Trust X-Forwarded-For headers from reverse proxy. */
    trustProxy: boolean;
    /** Comma-separated list of allowed CORS origins. */
    corsOrigins: string;
    /** Base URL for frontend (used in password reset links). */
    frontendUrl: string;
    /** Enable HTTP to HTTPS redirect. */
    httpsRedirect: boolean;
  };
  /** Authentication configuration. */
  auth: {
    /** Session configuration. */
    session: {
      /** Secret for signing session cookies. */
      secret: string | null;
      /** Session inactivity timeout in milliseconds. */
      maxAge: number;
      /** Absolute maximum session lifetime in milliseconds. */
      absoluteMaxAge: number;
      /** Set the secure flag on session cookies. */
      secure: boolean;
      /** AES-256 key for session data encryption at rest. */
      encryptionKey: string;
      /** Cookie configuration. */
      cookie: {
        /** Set the HttpOnly flag on session cookies. */
        httpOnly: boolean;
        /** Set the SameSite attribute on session cookies. */
        sameSite: string;
        /** Save uninitialized sessions to the store. */
        saveUninitialized: boolean;
        /** Renew session on every request. */
        rolling: boolean;
      };
    };
    /** Password policy configuration. */
    password: {
      /** Minimum password length. */
      minLength: number;
      /** Require at least one uppercase letter. */
      requireUppercase: boolean;
      /** Require at least one lowercase letter. */
      requireLowercase: boolean;
      /** Require at least one digit. */
      requireDigits: boolean;
      /** Require at least one symbol. */
      requireSymbols: boolean;
      /** Number of previous passwords to remember. */
      historyDepth: number;
      /** Argon2id memory cost in KiB. */
      hashMemory: number;
      /** Argon2id time cost. */
      hashTime: number;
      /** Argon2id parallelism degree. */
      hashParallelism: number;
    };
    /** Login rate limiting configuration. */
    login: {
      /** Maximum failed login attempts before lockout. */
      rateLimitMax: number;
      /** Login rate limit window in milliseconds. */
      rateLimitWindow: number;
      /** Account lockout duration in milliseconds. */
      lockoutDuration: number;
    };
    /** Registration rate limiting configuration. */
    registration: {
      /** Maximum registrations per IP per window. */
      rateLimitMax: number;
      /** Registration rate limit window in milliseconds. */
      rateLimitWindow: number;
    };
    /** Password reset configuration. */
    passwordReset: {
      /** Password reset token expiration in milliseconds. */
      tokenExpiry: number;
      /** Number of random bytes for token generation. */
      tokenByteLength: number;
      /** Maximum reset requests per IP per window. */
      rateLimitMax: number;
      /** Password reset rate limit window in milliseconds. */
      rateLimitWindow: number;
    };
    /** Password change rate limiting configuration. */
    passwordChange: {
      /** Maximum password change requests per user per window. */
      rateLimitMax: number;
      /** Password change rate limit window in milliseconds. */
      rateLimitWindow: number;
    };
    /** Email confirmation rate limiting configuration. */
    emailConfirm: {
      /** Maximum email confirmation attempts per IP per window. */
      rateLimitMax: number;
      /** Email confirmation rate limit window in milliseconds. */
      rateLimitWindow: number;
    };
    /** Email change request rate limiting configuration. */
    emailChangeRequest: {
      /** Maximum email change requests per IP per window. */
      rateLimitMax: number;
      /** Email change request rate limit window in milliseconds. */
      rateLimitWindow: number;
    };
    /** User search rate limiting configuration. */
    userSearch: {
      /** Maximum user search requests per IP per window. */
      rateLimitMax: number;
      /** User search rate limit window in milliseconds. */
      rateLimitWindow: number;
    };
    /** Breach check configuration. */
    breachCheck: {
      /** HIBP API base URL. */
      hibpApiUrl: string;
    };
    /** Email configuration. */
    email: {
      /** Enable or disable email sending. */
      enabled: boolean;
      /** Email provider type. */
      provider: string;
      /** SMTP server host. */
      smtpHost: string;
      /** SMTP server port. */
      smtpPort: number;
      /** SMTP authentication user. */
      smtpUser: string;
      /** SMTP authentication password. */
      smtpPassword: string;
      /** SendGrid API key. */
      sendgridApiKey: string;
      /** AWS SES region. */
      sesRegion: string;
      /** From address for transactional emails. */
      from: string | null;
      /** Email templates. */
      templates: {
        /** Password reset request email template. */
        resetRequest: { subject: string; html: string };
        /** Password changed notification email template. */
        passwordChanged: { subject: string; html: string };
        /** Email change confirmation email template. */
        emailChangeRequest: { subject: string; html: string };
      };
    };
  };
}
