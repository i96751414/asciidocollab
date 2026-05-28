# Quickstart: Configuration Strategy

**Feature**: 004-config-strategy
**Date**: 2026-05-28

## Prerequisites

- Node.js 24.x
- pnpm (monorepo package manager)

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Required Environment Variables

For development, create a `.env` file in `apps/api/`:

```bash
# Required secrets (never commit these)
ASCIIDOCOLLAB_AUTH_SESSION_SECRET=dev-session-secret-at-least-32-chars
ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY=64-character-hex-string-for-aes256-encryption-key!!
ASCIIDOCOLLAB_AUTH_EMAIL_FROM=noreply@asciidocollab.example.com

# Optional: override defaults
ASCIIDOCOLLAB_API_PORT=4000
```

### 3. Run the Application

```bash
pnpm --filter=@asciidocollab/api dev
```

The application loads configuration in this order:
1. `apps/api/config/default.yaml` — base defaults
2. `apps/api/config/{NODE_ENV}.yaml` — environment override (e.g., `development.yaml`)
3. Environment variables — highest priority overrides

### 4. Edit Configuration

Open `apps/api/config/default.yaml` to change settings:

```yaml
api:
  port: 4000
  host: 0.0.0.0

auth:
  session:
    maxAge: 1800000    # 30 minutes
  password:
    minLength: 12
    requireUppercase: true
```

### 5. Environment-Specific Overrides

For production, either:
- Set `NODE_ENV=production` and edit `apps/api/config/production.yaml`
- Or override via environment variables:

```bash
ASCIIDOCOLLAB_API_PORT=8080
ASCIIDOCOLLAB_AUTH_SESSION_MAX_AGE=3600000
```

## Configuration Access

### In Route Handlers

Access config via `app.config` or `request.server.config`:

```typescript
// Rate limiting (evaluated at route registration time)
app.post('/auth/login', {
  config: {
    rateLimit: {
      max: app.config.auth.login.rateLimitMax,
      timeWindow: app.config.auth.login.rateLimitWindow,
    },
  },
}, async (request, reply) => {
  // Access config in handler
  const timeout = request.server.config.auth.session.maxAge;
});
```

### In Services

Access config via `getConfig()`:

```typescript
import { getConfig } from '../config';

export async function hashPassword(password: string): Promise<string> {
  const config = getConfig();
  return argon2.hash(password, {
    memoryCost: config.auth.password.hashMemory,
    timeCost: config.auth.password.hashTime,
    parallelism: config.auth.password.hashParallelism,
  });
}
```

### In Plugins

Access config via `app.config`:

```typescript
async function authPlugin(app: FastifyInstance): Promise<void> {
  const secret = app.config.auth.session.secret;
  // ...
}
```

## Sensitive Fields

The following fields are marked `sensitive: true` and are redacted in logs/output:

| Field | Environment Variable |
|-------|---------------------|
| `auth.session.secret` | `ASCIIDOCOLLAB_AUTH_SESSION_SECRET` |
| `auth.session.encryptionKey` | `ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY` |
| `auth.email.smtpPassword` | `ASCIIDOCOLLAB_AUTH_SMTP_PASSWORD` |
| `auth.email.sendgridApiKey` | `ASCIIDOCOLLAB_AUTH_SENDGRID_API_KEY` |

**Never put secrets in YAML files.** They must be provided via environment variables only.

## Environment Variable Mapping

All environment variables follow the pattern `ASCIIDOCOLLAB_<CATEGORY>_<FIELD>`:

| Config Path | Environment Variable | Default |
|-------------|---------------------|---------|
| `api.port` | `ASCIIDOCOLLAB_API_PORT` | 4000 |
| `api.host` | `ASCIIDOCOLLAB_API_HOST` | 0.0.0.0 |
| `api.trustProxy` | `ASCIIDOCOLLAB_API_TRUST_PROXY` | false |
| `api.corsOrigins` | `ASCIIDOCOLLAB_API_CORS_ORIGINS` | "" |
| `api.frontendUrl` | `ASCIIDOCOLLAB_API_FRONTEND_URL` | https://asciidocollab.example.com |
| `api.httpsRedirect` | `ASCIIDOCOLLAB_API_HTTPS_REDIRECT` | false |
| `auth.session.secret` | `ASCIIDOCOLLAB_AUTH_SESSION_SECRET` | (required) |
| `auth.session.maxAge` | `ASCIIDOCOLLAB_AUTH_SESSION_MAX_AGE` | 1800000 |
| `auth.session.absoluteMaxAge` | `ASCIIDOCOLLAB_AUTH_SESSION_ABSOLUTE_MAX_AGE` | 86400000 |
| `auth.session.secure` | `ASCIIDOCOLLAB_AUTH_COOKIE_SECURE` | true |
| `auth.session.encryptionKey` | `ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY` | (required) |
| `auth.password.minLength` | `ASCIIDOCOLLAB_AUTH_PASSWORD_MIN_LENGTH` | 12 |
| `auth.password.requireUppercase` | `ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_UPPERCASE` | true |
| `auth.password.requireLowercase` | `ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_LOWERCASE` | true |
| `auth.password.requireDigits` | `ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_DIGITS` | true |
| `auth.password.requireSymbols` | `ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_SYMBOLS` | true |
| `auth.password.historyDepth` | `ASCIIDOCOLLAB_AUTH_PASSWORD_HISTORY_DEPTH` | 5 |
| `auth.password.hashMemory` | `ASCIIDOCOLLAB_AUTH_PASSWORD_HASH_MEMORY` | 65536 |
| `auth.password.hashTime` | `ASCIIDOCOLLAB_AUTH_PASSWORD_HASH_TIME` | 3 |
| `auth.password.hashParallelism` | `ASCIIDOCOLLAB_AUTH_PASSWORD_HASH_PARALLELISM` | 1 |
| `auth.login.rateLimitMax` | `ASCIIDOCOLLAB_AUTH_LOGIN_RATE_LIMIT_MAX` | 5 |
| `auth.login.rateLimitWindow` | `ASCIIDOCOLLAB_AUTH_LOGIN_RATE_LIMIT_WINDOW` | 900000 |
| `auth.login.lockoutDuration` | `ASCIIDOCOLLAB_AUTH_LOGIN_LOCKOUT_DURATION` | 900000 |
| `auth.registration.rateLimitMax` | `ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_MAX` | 3 |
| `auth.registration.rateLimitWindow` | `ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_WINDOW` | 3600000 |
| `auth.passwordReset.tokenExpiry` | `ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_TOKEN_EXPIRY` | 3600000 |
| `auth.passwordReset.rateLimitMax` | `ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_MAX` | 3 |
| `auth.passwordReset.rateLimitWindow` | `ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_WINDOW` | 3600000 |
| `auth.passwordChange.rateLimitMax` | `ASCIIDOCOLLAB_AUTH_PASSWORD_CHANGE_RATE_LIMIT_MAX` | 5 |
| `auth.passwordChange.rateLimitWindow` | `ASCIIDOCOLLAB_AUTH_PASSWORD_CHANGE_RATE_LIMIT_WINDOW` | 900000 |
| `auth.email.provider` | `ASCIIDOCOLLAB_AUTH_EMAIL_PROVIDER` | smtp |
| `auth.email.smtpHost` | `ASCIIDOCOLLAB_AUTH_SMTP_HOST` | "" |
| `auth.email.smtpPort` | `ASCIIDOCOLLAB_AUTH_SMTP_PORT` | 587 |
| `auth.email.smtpUser` | `ASCIIDOCOLLAB_AUTH_SMTP_USER` | "" |
| `auth.email.smtpPassword` | `ASCIIDOCOLLAB_AUTH_SMTP_PASSWORD` | "" |
| `auth.email.sendgridApiKey` | `ASCIIDOCOLLAB_AUTH_SENDGRID_API_KEY` | "" |
| `auth.email.sesRegion` | `ASCIIDOCOLLAB_AUTH_SES_REGION` | "" |
| `auth.email.from` | `ASCIIDOCOLLAB_AUTH_EMAIL_FROM` | (required) |

## Testing Configuration

```bash
# Run config-specific tests
pnpm --filter=@asciidocollab/api test -- --testPathPattern=config
```
