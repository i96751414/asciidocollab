# Data Model: API Server + Local Authentication

## Entities

### User (existing — from Phase 1 domain layer)

| Field        | Type                 | Notes                                              |
|--------------|----------------------|----------------------------------------------------|
| id              | UserId (UUID)        | Primary key                                        |
| email           | Email (value object) | Unique. Validated on registration (FR-005)         |
| displayName     | string               | Chosen at registration                             |
| passwordHash    | string \| null       | Argon2id hash (FR-008). Null for SAML-only users   |
| passwordHistory | string[]             | Array of argon2id hashes of last N passwords (FR-027). Stored as PostgreSQL `TEXT[]` via Prisma `@pg.array()`. Default empty |
| samlSubject     | string \| null       | SAML subject identifier. Null for local-only users |
| mfaSecret       | string \| null       | Deferred to Phase 15                               |
| timestamps      | Timestamps           | createdAt, updatedAt                               |

**Invariants** (from domain):

- At least one of `passwordHash` or `samlSubject` must be non-null
- Email must be unique

**Phase 3 operations**: `UserRepository.findByEmail()`, `UserRepository.save()` (update passwordHash and passwordHistory on change/reset)

### Session (new — Phase 3)

| Field     | Type          | Notes                                                |
|-----------|---------------|------------------------------------------------------|
| id        | string (UUID) | Primary key                                          |
| userId    | string (UUID) | FK → User.id. Indexed for user session queries       |
| sid       | string        | Unique session identifier. Stored in cookie (signed) |
| data      | json          | Session payload (user ID, expiry, CSRF token). Encrypted at rest (FR-014) via Prisma middleware |
| expiresAt | datetime      | Session expiry. Checked on every request             |
| createdAt | datetime      | When the session was created                         |
| updatedAt | datetime      | Updated on each request (sliding expiration)         |

**Indexes**: `userId`, `sid` (unique), `expiresAt`

**Prisma schema addition**: Add `Session` model to existing `packages/db/prisma/schema.prisma`.

### PasswordResetToken (new — Phase 3)

| Field     | Type          | Notes                                                |
|-----------|---------------|------------------------------------------------------|
| id        | string (UUID) | Primary key                                          |
| userId    | string (UUID) | FK → User.id. Indexed for lookups                    |
| tokenHash | string        | Argon2id hash of the reset token (FR-035)            |
| expiresAt | datetime      | Token expiry. Checked before use (FR-030)            |
| usedAt    | datetime?     | Null until token is consumed (FR-030: single-use)    |
| createdAt | datetime      | When the token was created                           |

**Indexes**: `userId`, `expiresAt`

## Prisma Schema Additions

```prisma
model Session {
  id        String   @id @default(uuid())
  userId    String   
  sid       String   @unique
  data      Json     
  expiresAt DateTime 
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([expiresAt])
}

model PasswordResetToken {
  id        String    @id @default(uuid())
  userId    String
  tokenHash String
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
  @@index([expiresAt])
}
```

## Environment Variables

All configurable parameters (FR-037) with their defaults:

| Variable                                            | Default         | Description                               |
|-----------------------------------------------------|-----------------|-------------------------------------------|
| `ASCIIDOCOLLAB_AUTH_SESSION_SECRET`                 | (required)      | Secret for signing session cookies        |
| `ASCIIDOCOLLAB_AUTH_SESSION_MAX_AGE`                | 1800000 (30min) | Session inactivity timeout in ms          |
| `ASCIIDOCOLLAB_AUTH_SESSION_ABSOLUTE_MAX_AGE`       | 86400000 (24h)  | Absolute max session lifetime in ms       |
| `ASCIIDOCOLLAB_AUTH_COOKIE_SECURE`                  | true            | Set `secure` flag on session cookies      |
| `ASCIIDOCOLLAB_AUTH_PASSWORD_MIN_LENGTH`            | 12              | Minimum password length                   |
| `ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_UPPERCASE`     | true            | Require uppercase letters                 |
| `ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_LOWERCASE`     | true            | Require lowercase letters                 |
| `ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_DIGITS`        | true            | Require digits                            |
| `ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_SYMBOLS`       | true            | Require symbols                           |
| `ASCIIDOCOLLAB_AUTH_PASSWORD_HISTORY_DEPTH`         | 5               | Number of previous passwords to block     |
| `ASCIIDOCOLLAB_AUTH_PASSWORD_HASH_MEMORY`           | 65536 (64MB)    | Argon2id memory cost in KiB               |
| `ASCIIDOCOLLAB_AUTH_PASSWORD_HASH_TIME`             | 3               | Argon2id time cost                        |
| `ASCIIDOCOLLAB_AUTH_PASSWORD_HASH_PARALLELISM`      | 1               | Argon2id parallelism                      |
| `ASCIIDOCOLLAB_AUTH_LOGIN_RATE_LIMIT_MAX`           | 5               | Failed login attempts before lockout      |
| `ASCIIDOCOLLAB_AUTH_LOGIN_RATE_LIMIT_WINDOW`        | 900000 (15min)  | Rate limit window in ms                   |
| `ASCIIDOCOLLAB_AUTH_LOGIN_LOCKOUT_DURATION`         | 900000 (15min)  | Lockout duration in ms                    |
| `ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_MAX`    | 3               | Registrations per IP per window           |
| `ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_WINDOW` | 3600000 (1h)    | Registration rate limit window            |
| `ASCIIDOCOLLAB_AUTH_RESET_TOKEN_EXPIRY`             | 3600000 (1h)    | Password reset token TTL in ms            |
| `ASCIIDOCOLLAB_AUTH_RESET_RATE_LIMIT_MAX`           | 3               | Reset requests per IP per window          |
| `ASCIIDOCOLLAB_AUTH_RESET_RATE_LIMIT_WINDOW`        | 3600000 (1h)    | Reset rate limit window in ms             |
| `ASCIIDOCOLLAB_AUTH_EMAIL_FROM`                     | (required)      | From address for password reset emails    |
| `ASCIIDOCOLLAB_AUTH_EMAIL_PROVIDER`                 | smtp            | Email provider type (smtp, sendgrid, ses) |
| `ASCIIDOCOLLAB_AUTH_SMTP_HOST`                      | (required if SMTP) | SMTP server host                      |
| `ASCIIDOCOLLAB_AUTH_SMTP_PORT`                      | 587             | SMTP server port                           |
| `ASCIIDOCOLLAB_AUTH_SMTP_USER`                      | (required if SMTP) | SMTP authentication user              |
| `ASCIIDOCOLLAB_AUTH_SMTP_PASSWORD`                  | (required if SMTP) | SMTP authentication password          |
| `ASCIIDOCOLLAB_AUTH_SENDGRID_API_KEY`               | (required if sendgrid) | SendGrid API key                   |
| `ASCIIDOCOLLAB_AUTH_SES_REGION`                     | (required if ses) | AWS SES region                          |
| `ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY`         | (required)      | AES-256 key for session data encryption at rest |
| `ASCIIDOCOLLAB_API_PORT`                            | 4000            | API server port                           |
| `ASCIIDOCOLLAB_API_HOST`                            | 0.0.0.0         | API server host                           |
| `ASCIIDOCOLLAB_API_TRUST_PROXY`                     | false           | Enable if behind a reverse proxy          |
| `ASCIIDOCOLLAB_API_CORS_ORIGINS`                    | *               | Allowed CORS origins (comma-separated, `*` for all) |

Convention: `ASCIIDOCOLLAB_CATEGORY_VARIABLE` — application name prefix (`ASCIIDOCOLLAB_`) + category (`AUTH_` /
`API_`) + variable name. Zero hardcoded magic numbers — every tunable value is an environment variable.
