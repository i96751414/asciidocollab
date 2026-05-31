# AsciiDoCollab Security Constitution

## Trust Boundaries

```
Internet → Load Balancer (TLS) → Fastify API → Domain Use Cases → Infrastructure
                                                    ↓
                                              PostgreSQL / Docker (git sandbox)
```

- TLS MUST be terminated at the load balancer / reverse proxy.
- Internal service-to-service communication (Fastify ↔ Hocuspocus) MAY use plain HTTP
  within the Docker network.
- The domain layer is the trust boundary — all external input MUST be validated before
  reaching domain logic.

---

## Authentication & Authorization Standards

- **RBAC in the domain:** Permission checks MUST live in use cases, not in route
  handlers. Routes call use cases; use cases enforce authorization. No route MAY
  duplicate a permission check that the domain already performs.
- Session-based authentication with PostgreSQL-backed sessions (Prisma store).
- In-memory or filesystem session stores are not permitted.

---

## Data Isolation & Privacy Rules

- Each project's data is isolated by `projectId` foreign keys on all domain tables.
- Multi-tenant isolation enforced at the repository layer — queries MUST filter by
  project context.
- File uploads stored with project-scoped paths. No cross-project file access.

---

## Secrets Management Policy

- **Credential handling:** Secrets (API tokens, SSH keys, TOTP secrets) MUST be
  encrypted at rest with AES-256. They MUST never be logged, committed, or written to
  disk unencrypted.
- Environment variables via `.env` files, never hardcoded.
- No secrets in version control — `.gitignore` MUST exclude all credential files.

---

## Secure-by-Design Patterns

- **Input validation:** All external input MUST be validated at the boundary (Fastify
  schema validation for API, Zod for frontend forms). The domain layer MUST NOT trust
  its inputs.
- **Typed errors prevent information leaks:** Domain error types MUST NOT expose
  internal state (stack traces, DB IDs, file paths) to the client. Fastify's error
  handler maps domain errors to safe HTTP responses.
- **Dependency scanning:** All runtime dependencies MUST be scanned for known
  vulnerabilities as part of the CI pipeline.

---

## API & Integration Security

- Rate limiting on all public endpoints.
- CORS configured for allowed origins only.
- Request size limits enforced at the Fastify level.
- No direct database access from the frontend — all data flows through the API layer.

---

## Git Sandbox Security

- Each git operation MUST spawn a short-lived Docker container (FR-011).
- The container mounts only the requesting project's directory.
- No git commands execute on the host machine or share process state between projects.
- Container runs with minimal privileges — no network access, read-only filesystem
  except the mounted project directory.

---

## Audit, Logging & Monitoring Requirements

- All authentication events (login, logout, failed attempts) MUST be logged.
- All authorization denials MUST be logged with actor, resource, and reason.
- Sensitive fields (passwords, tokens, secrets) MUST be redacted from all logs.
- Error monitoring captures unhandled exceptions without exposing internals to clients.

---

## Security Incident Response Triggers

- Multiple failed login attempts from the same IP → temporary lockout + alert.
- Dependency vulnerability detected → CI fails, blocks merge.
- Secrets detected in git history → immediate rotation + audit.
- Unauthorized cross-project access attempt → alert + session termination.

---

**Version**: 1.0.0 | **Ratified**: 2026-05-27 | **Last Amended**: 2026-05-28
