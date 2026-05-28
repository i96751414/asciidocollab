# Research: API Server + Local Authentication

**Phase**: 0 | **Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

## Decisions

### HTTP Framework

- **Decision**: Fastify (v6, latest)
- **Rationale**: Already established in architecture spec and monorepo tech stack. Plugin ecosystem covers all Phase 3
  needs (session, CSRF, rate limiting, cookie parsing, schema validation, OpenAPI). Schema-first validation aligns with
  FR-016 and constitution Principle IV.
- **Alternatives considered**: Express (lacks built-in schema validation, plugin quality varies), Hono (excellent but
  adds new runtime dependency not in architecture spec).

### Password Hashing

- **Decision**: argon2 (npm package, v0.41+, the canonical C-binding wrapper)
- **Rationale**: FR-008 specifies argon2id with specific parameters. The `argon2` npm package is the standard Node.js
  binding to the libargon2 C library — it is well-audited, actively maintained, and used in production by thousands of
  projects.
- **Alternatives considered**: `bcrypt` (slower than argon2, no built-in memory-hardness tuning), `@node-rs/argon2` (
  Rust-native, faster but less ecosystem maturity).

### Session Management

- **Decision**: `@fastify/session` with a custom Prisma-backed session store + `@fastify/cookie`
- **Rationale**: Server-side sessions stored in PostgreSQL align with the architecture spec. A custom Prisma-backed store
  implements `@fastify/session`'s `SessionStore` interface using the existing Prisma client. This avoids introducing
  `connect-pg-simple` (which uses raw SQL and bypasses Prisma's type safety and encryption middleware), and keeps
  session data encryption transparent via Prisma middleware hooks.
- **Alternatives considered**: `@fastify/secure-session` (stateless encrypted cookies — simpler but doesn't support
  server-side session invalidation required by FR-024/FR-032), `connect-pg-simple` (raw SQL, bypasses Prisma type safety
  and encryption middleware), Redis-based sessions (adds infrastructure dependency not yet in the stack).

### Session Data Encryption at Rest

- **Decision**: Encrypt session `data` JSON column using `@fastify/session`'s cookie encryption combined with a Prisma
  middleware that serializes/encrypts before write and decrypts after read. AES-256-GCM via Node.js built-in
  `node:crypto.createCipheriv`.
- **Rationale**: FR-014 requires session tokens encrypted at rest. `@fastify/session` signs cookies (integrity) but
  doesn't encrypt the session data column in PostgreSQL by default. A Prisma middleware hook encrypts the `data` field
  on `create`/`update` operations and decrypts on `find` operations — this keeps encryption transparent to the
  application layer. AES-256-GCM provides authenticated encryption (integrity + confidentiality). No additional library
  needed — `node:crypto` has built-in AES-256-GCM support.
- **Alternatives considered**: Database-level encryption (pgcrypto extension — couples encryption to PostgreSQL, harder
  to test with SQLite), application-level before/after hooks in the repository layer (more boilerplate, easier to miss a
  code path).

### CSRF Protection

- **Decision**: `@fastify/csrf-protection`
- **Rationale**: Official Fastify plugin. Supports double-submit cookie and custom header patterns (matches the spec's
  assumption). No custom CSRF implementation needed.
- **Alternatives considered**: Custom token generation (rejected per principle of avoiding custom crypto).

### Rate Limiting

- **Decision**: `@fastify/rate-limit`
- **Rationale**: Official Fastify plugin. Supports per-route configuration via `config.rateLimit`. Handles per-IP and
  per-key (account) rate limiting. In-memory per-process (matches spec assumption that distributed rate limiting is
  deferred).
- **Alternatives considered**: Custom in-memory counters (not a trusted library — adding a rate limiter from scratch is
  error-prone).

### Email Dispatch

- **Decision**: `nodemailer` for SMTP-based delivery, or a transactional email SDK (SendGrid, SES, Mailgun)
- **Rationale**: The API delegates email sending per the spec's assumption. `nodemailer` is the standard Node.js email
  library. For production deployments, a transactional email service is preferred (handles deliverability, bounce
  handling). The email provider config is an environment variable.
- **Alternatives considered**: Built-in SMTP via `node:net` (raw protocol — unnecessary complexity).

### Password Reset Tokens

- **Decision**: `node:crypto.randomBytes(32)` → hex for token generation. Hashed with argon2 before storage (FR-035).
- **Rationale**: Node.js built-in `crypto` module provides cryptographically secure random bytes. No external library
  needed for generation. Hashing with argon2 (same as passwords) ensures a DB leak doesn't expose active tokens.
- **Alternatives considered**: UUID v4 (not cryptographically random by spec — Node.js v4 crypto UUIDs are random, but
  the quality depends on the RNG. `randomBytes` is explicit and auditable.)

### Environment Config Validation

- **Decision**: `@fastify/env` (or `env-schema` from the Fastify ecosystem)
- **Rationale**: Validates all environment variables on server startup, providing typed config objects with defaults.
  Matches FR-037 (all parameters configurable via env vars, zero hardcoded magic numbers). Env vars follow the
  `ASCIIDOCOLLAB_CATEGORY_VARIABLE` convention for namespace clarity (e.g., `ASCIIDOCOLLAB_AUTH_SESSION_SECRET`,
  `ASCIIDOCOLLAB_API_PORT`).
- **Alternatives considered**: `dotenv` (no validation), `zod` (more general purpose, less integrated with Fastify).

## Decisions Summary

| Concern           | Library                                  | Justification                                       |
|-------------------|------------------------------------------|-----------------------------------------------------|
| HTTP server       | Fastify                                  | Established in architecture spec                    |
| Password hashing  | `argon2`                                 | FR-008 compliance, well-audited C binding           |
| Session           | `@fastify/session` + custom Prisma store  | Prisma-backed, type-safe, encryption middleware      |
| CSRF              | `@fastify/csrf-protection`               | Official plugin, no custom implementation           |
| Rate limiting     | `@fastify/rate-limit`                    | Official plugin, per-route config                   |
| Email             | `nodemailer`                             | Standard email library, provider-agnostic           |
| Config validation | `@fastify/env`                           | Schema-first env validation with defaults           |
| Token generation  | `node:crypto`                            | Built-in, cryptographically secure, no external dep |
