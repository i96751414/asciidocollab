# Contracts: Configuration Strategy

**Feature**: 004-config-strategy
**Date**: 2026-05-28

## Config Interface

The configuration system exposes a typed interface via `app.config`:

```typescript
interface Config {
  env: 'production' | 'development' | 'test';
  api: {
    port: number;
    host: string;
    trustProxy: boolean;
    corsOrigins: string;
    frontendUrl: string;
    httpsRedirect: boolean;
  };
  auth: {
    session: {
      secret: string;        // sensitive
      maxAge: number;
      absoluteMaxAge: number;
      secure: boolean;
      encryptionKey: string; // sensitive
      cookie: {
        httpOnly: boolean;
        sameSite: string;
        saveUninitialized: boolean;
        rolling: boolean;
      };
    };
    password: {
      minLength: number;
      requireUppercase: boolean;
      requireLowercase: boolean;
      requireDigits: boolean;
      requireSymbols: boolean;
      historyDepth: number;
      hashMemory: number;
      hashTime: number;
      hashParallelism: number;
    };
    login: {
      rateLimitMax: number;
      rateLimitWindow: number;
      lockoutDuration: number;
    };
    registration: {
      rateLimitMax: number;
      rateLimitWindow: number;
    };
    passwordReset: {
      tokenExpiry: number;
      tokenByteLength: number;
      rateLimitMax: number;
      rateLimitWindow: number;
    };
    passwordChange: {
      rateLimitMax: number;
      rateLimitWindow: number;
    };
    breachCheck: {
      hibpApiUrl: string;
    };
    email: {
      provider: string;
      smtpHost: string;
      smtpPort: number;
      smtpUser: string;
      smtpPassword: string;  // sensitive
      sendgridApiKey: string; // sensitive
      sesRegion: string;
      from: string;
      templates: {
        resetRequest: { subject: string; html: string; };
        passwordChanged: { subject: string; html: string; };
        breachAlert: { subject: string; html: string; };
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

auth:
  session:
    maxAge: 1800000
    absoluteMaxAge: 86400000
    secure: true
  password:
    minLength: 12
    # ... etc
```

Secrets are NEVER in YAML files. They are provided via environment variables only.
