# Data Model: Configuration Strategy

**Feature**: 004-config-strategy
**Date**: 2026-05-28

## Configuration Schema

### api.category

| Field | Type | Default | Env Var | Format | Sensitive |
|-------|------|---------|---------|--------|-----------|
| port | integer | 4000 | ASCIIDOCOLLAB_API_PORT | port | No |
| host | string | 0.0.0.0 | ASCIIDOCOLLAB_API_HOST | hostname | No |
| trustProxy | boolean | false | ASCIIDOCOLLAB_API_TRUST_PROXY | — | No |
| corsOrigins | string | "" | ASCIIDOCOLLAB_API_CORS_ORIGINS | — | No |

### auth.session.category

| Field | Type | Default | Env Var | Format | Sensitive |
|-------|------|---------|---------|--------|-----------|
| secret | string | (none) | ASCIIDOCOLLAB_AUTH_SESSION_SECRET | required-string | **Yes** |
| maxAge | integer | 1800000 | ASCIIDOCOLLAB_AUTH_SESSION_MAX_AGE | integer | No |
| absoluteMaxAge | integer | 86400000 | ASCIIDOCOLLAB_AUTH_SESSION_ABSOLUTE_MAX_AGE | integer | No |
| secure | boolean | true | ASCIIDOCOLLAB_AUTH_COOKIE_SECURE | — | No |
| encryptionKey | string | (none) | ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY | required-string | **Yes** |

### auth.password.category

| Field | Type | Default | Env Var | Format | Sensitive |
|-------|------|---------|---------|--------|-----------|
| minLength | integer | 12 | ASCIIDOCOLLAB_AUTH_PASSWORD_MIN_LENGTH | integer | No |
| requireUppercase | boolean | true | ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_UPPERCASE | — | No |
| requireLowercase | boolean | true | ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_LOWERCASE | — | No |
| requireDigits | boolean | true | ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_DIGITS | — | No |
| requireSymbols | boolean | true | ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_SYMBOLS | — | No |
| historyDepth | integer | 5 | ASCIIDOCOLLAB_AUTH_PASSWORD_HISTORY_DEPTH | integer | No |
| hashMemory | integer | 65536 | ASCIIDOCOLLAB_AUTH_PASSWORD_HASH_MEMORY | integer | No |
| hashTime | integer | 3 | ASCIIDOCOLLAB_AUTH_PASSWORD_HASH_TIME | integer | No |
| hashParallelism | integer | 1 | ASCIIDOCOLLAB_AUTH_PASSWORD_HASH_PARALLELISM | integer | No |

### auth.login.category

| Field | Type | Default | Env Var | Format | Sensitive |
|-------|------|---------|---------|--------|-----------|
| rateLimitMax | integer | 5 | ASCIIDOCOLLAB_AUTH_LOGIN_RATE_LIMIT_MAX | integer | No |
| rateLimitWindow | integer | 900000 | ASCIIDOCOLLAB_AUTH_LOGIN_RATE_LIMIT_WINDOW | integer | No |
| lockoutDuration | integer | 900000 | ASCIIDOCOLLAB_AUTH_LOGIN_LOCKOUT_DURATION | integer | No |

### auth.registration.category

| Field | Type | Default | Env Var | Format | Sensitive |
|-------|------|---------|---------|--------|-----------|
| rateLimitMax | integer | 3 | ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_MAX | integer | No |
| rateLimitWindow | integer | 3600000 | ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_WINDOW | integer | No |

### auth.passwordReset.category

| Field | Type | Default | Env Var | Format | Sensitive |
|-------|------|---------|---------|--------|-----------|
| tokenExpiry | integer | 3600000 | ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_TOKEN_EXPIRY | integer | No |
| rateLimitMax | integer | 3 | ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_MAX | integer | No |
| rateLimitWindow | integer | 3600000 | ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_WINDOW | integer | No |

### auth.passwordChange.category

| Field | Type | Default | Env Var | Format | Sensitive |
|-------|------|---------|---------|--------|-----------|
| rateLimitMax | integer | 5 | ASCIIDOCOLLAB_AUTH_PASSWORD_CHANGE_RATE_LIMIT_MAX | integer | No |
| rateLimitWindow | integer | 900000 | ASCIIDOCOLLAB_AUTH_PASSWORD_CHANGE_RATE_LIMIT_WINDOW | integer | No |

### auth.email.category

| Field | Type | Default | Env Var | Format | Sensitive |
|-------|------|---------|---------|--------|-----------|
| provider | string | smtp | ASCIIDOCOLLAB_AUTH_EMAIL_PROVIDER | — | No |
| smtpHost | string | "" | ASCIIDOCOLLAB_AUTH_SMTP_HOST | — | No |
| smtpPort | integer | 587 | ASCIIDOCOLLAB_AUTH_SMTP_PORT | integer | No |
| smtpUser | string | "" | ASCIIDOCOLLAB_AUTH_SMTP_USER | — | No |
| smtpPassword | string | "" | ASCIIDOCOLLAB_AUTH_SMTP_PASSWORD | — | **Yes** |
| sendgridApiKey | string | "" | ASCIIDOCOLLAB_AUTH_SENDGRID_API_KEY | — | **Yes** |
| sesRegion | string | "" | ASCIIDOCOLLAB_AUTH_SES_REGION | — | No |
| from | string | (none) | ASCIIDOCOLLAB_AUTH_EMAIL_FROM | required-string | No |

## Sensitive Fields Summary

| Field | Env Var | Redacted In |
|-------|---------|-------------|
| auth.session.secret | ASCIIDOCOLLAB_AUTH_SESSION_SECRET | Logs, config output |
| auth.session.encryptionKey | ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY | Logs, config output |
| auth.email.smtpPassword | ASCIIDOCOLLAB_AUTH_SMTP_PASSWORD | Logs, config output |
| auth.email.sendgridApiKey | ASCIIDOCOLLAB_AUTH_SENDGRID_API_KEY | Logs, config output |
