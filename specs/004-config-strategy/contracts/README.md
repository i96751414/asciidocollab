# Contracts: Configuration Strategy

**Feature**: 004-config-strategy
**Date**: 2026-05-28

## Config Interface

The configuration system exposes a typed interface via `app.config`:

```typescript
interface Config {
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
      secret: string;        // sensitive
      /** Session inactivity timeout in milliseconds. */
      maxAge: number;
      /** Absolute maximum session lifetime in milliseconds. */
      absoluteMaxAge: number;
      /** Set the secure flag on session cookies. */
      secure: boolean;
      /** AES-256 key for session data encryption at rest. */
      encryptionKey: string; // sensitive
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
    /** Breach check configuration. */
    breachCheck: {
      /** HIBP API base URL. */
      hibpApiUrl: string;
    };
    /** Email configuration. */
    email: {
      /** Email provider type. */
      provider: string;
      /** SMTP server host. */
      smtpHost: string;
      /** SMTP server port. */
      smtpPort: number;
      /** SMTP authentication user. */
      smtpUser: string;
      /** SMTP authentication password. */
      smtpPassword: string;  // sensitive
      /** SendGrid API key. */
      sendgridApiKey: string; // sensitive
      /** AWS SES region. */
      sesRegion: string;
      /** From address for transactional emails. */
      from: string;
      /** Email templates. */
      templates: {
        /** Password reset request email template. */
        resetRequest: { subject: string; html: string };
        /** Password changed notification email template. */
        passwordChanged: { subject: string; html: string };
        /** Password breach alert email template. */
        breachAlert: { subject: string; html: string };
      };
    };
  };
}
```

## Env Var Mapping

All environment variables follow the pattern `ASCIIDOCOLLAB_<CATEGORY>_<FIELD>`.

See `data-model.md` for the complete mapping table.

## YAML Structure

```yaml
# apps/api/config/default.yaml
env: development

api:
  port: 4000
  host: 0.0.0.0
  trustProxy: false
  corsOrigins: ""
  frontendUrl: "https://asciidocollab.example.com"
  httpsRedirect: false

auth:
  session:
    maxAge: 1800000
    absoluteMaxAge: 86400000
    secure: true
    cookie:
      httpOnly: true
      sameSite: lax
      saveUninitialized: false
      rolling: true
  password:
    minLength: 12
    # ... etc
```

Secrets are NEVER in YAML files. They are provided via environment variables only.

## File Locations

| File | Purpose |
|------|---------|
| `apps/api/src/config/schema.ts` | Convict schema definition (single source of truth) |
| `apps/api/src/config/index.ts` | Config loader (YAML + env var merging) |
| `apps/api/src/config/formats.ts` | Custom convict formats (hostname, required-string) |
| `apps/api/config/default.yaml` | Base defaults for all non-secret values |
| `apps/api/config/development.yaml` | Development environment overrides |
| `apps/api/config/production.yaml` | Production environment overrides |
| `apps/api/config/test.yaml` | Test environment overrides |
