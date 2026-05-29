<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan at
specs/005-configurable-mailer/plan.md
<!-- SPECKIT END -->

## Build & Test Commands

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Run domain-specific tests
pnpm --filter=domain test

# Run tests with coverage
pnpm test:coverage

# Type-check
pnpm typecheck

# Lint
pnpm lint

# Validate architecture boundaries
pnpm fresh-onion
```

## Phase 1 Implementation Summary

Phase 1 (Monorepo scaffold + domain layer) is **complete and merged to master**.

### What was built

- **9 entities**: User, Project, ProjectMember, FileNode, Document, Image, Template, GitRepository, AuditLog
- **19 value objects**: Uuid (base), 9 ID subclasses, Email, FilePath, Role, ProjectName, GitProvider, MimeType, FileNodeType, ContentId, YjsStateId, TemplateCategory, Timestamps
- **7 use cases**: create-project, rename-file, delete-file, invite-user, remove-member, change-member-role, get-project-tree
- **16 error classes**: DomainError (base), ProjectNotFoundError, UserNotFoundError, FileNodeNotFoundError, PermissionDeniedError, DuplicateEmailError, InvalidProjectNameError, FileConflictError, ProjectMemberAlreadyExistsError, CannotRemoveOwnerError, CannotChangeOwnerRoleError, CannotRemoveLastAdminError, CannotAttachDocumentToFolderError, CannotDeleteRootFolderError, MemberNotFoundError, ValidationError
- **9 repository interfaces** with in-memory fakes
- **Shared package**: Result<T,E> discriminated union + 7 DTOs
- **164 tests** across 18 test suites

## Phase 2 Implementation Summary

Phase 2 (Database layer) is **complete and merged to master**.

### What was built

- **2 new packages**: `packages/db` (Prisma schema + client) and `packages/infrastructure` (Prisma repository implementations)
- **Prisma schema**: 9 tables (User, Project, ProjectMember, FileNode, Document, Image, Template, GitRepository, AuditLog) with 3 enums (Role, FileNodeType, GitProvider), FK relationships with cascade rules, indexes, and `@db.Uuid` on all UUID columns
- **9 Prisma repository implementations**: PrismaUserRepository, PrismaProjectRepository, PrismaProjectMemberRepository, PrismaFileNodeRepository, PrismaDocumentRepository, PrismaImageRepository, PrismaTemplateRepository, PrismaGitRepositoryRepository, PrismaAuditLogRepository
- **Mapping layer**: `toDomain()` / `toPersistence()` helpers for all 9 entities, handling UUID string ↔ VO, Prisma enum ↔ domain VO, Date ↔ Timestamps, JSON ↔ AuditLog metadata
- **Integration test suite**: 9 test files covering all repositories against real PostgreSQL via testcontainers (postgres:16-alpine)
- **Test infrastructure**: Shared testcontainers helper and test data factories for all 9 entity types
- **Cross-cutting**: ESLint type assertion rules (`no-explicit-any: error`, `no-as-type-cast`), type mapping round-trip verification (13 tests)
- **All quality gates pass**: `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm fresh-onion`

### Key design decisions

- **Two-package separation**: `packages/db` owns schema + client generation; `packages/infrastructure` owns repository implementations using PrismaClient. Keeps schema concerns isolated from implementation concerns.
- **`PrismaEnum` mapping**: Domain VOs (Role, FileNodeType, GitProvider) map to Prisma enums via `.value` ↔ string constant — no Zod or runtime parsing needed.
- **`toDomain`/`toPersistence` pattern**: Each repository has two static/idempotent mapping functions that convert between Prisma records and domain entities. UUID VOs, Timestamps, and enums all handled uniformly.
- **`@db.Uuid` on all UUID columns**: Native PostgreSQL `uuid` type for all primary and foreign keys — avoids implicit `text` casting.
- **Recursive cascade delete**: FileNode hierarchy uses Prisma `onDelete: Cascade` on `parentId` self-FK — DB handles recursive deletion, not application code.
- **Composite PK for ProjectMember**: Prisma `@@id([projectId, userId])` — mirrors the domain's composite identity.
- **AuditLog JSON metadata**: Stored as Prisma `Json` type → mapped to/from `Record<string, unknown>` with `JSON.parse`/`JSON.stringify` round-trip.
- **No `as` casts in production code**: All type narrowing done via typed helper functions, ternary expressions, and `JSON.parse` with explicit `Record<string, unknown>` typing. 2 test helper violations exempted via ESLint overrides.

### Code conventions established

- **Zero runtime deps in domain** — enforced by fresh-onion
- **Value objects** — `static create()` + private constructor, throw `ValidationError` on bad input
- **UUID IDs** — extend `Uuid` abstract base, cross-type `equals()` via `instanceof` + constructor check
- **Timestamps** — `Timestamps` value object with defensive `Date` copies, used by User, Project, FileNode, Document
- **ID naming** — all ID params/fields use `Id` suffix (`actorId`, `fileNodeId`, `projectId`)
- **Use cases** — return `Result<T, DomainError>`, never throw
- **Entity invariants** — validated in constructor, errors thrown (programmer errors, not control flow)
- **In-memory fakes** — all 9 repos tested with Map-backed fakes, no mocking libraries
- **Architecture** — fresh-onion validates domain never imports outside its package
- **Env var naming** — all environment variables follow `ASCIIDOCOLLAB_CATEGORY_VARIABLE` convention (e.g., `ASCIIDOCOLLAB_DATABASE_URL`, `ASCIIDOCOLLAB_AUTH_SESSION_SECRET`). The `ASCIIDOCOLLAB_` prefix is the application name; category prefixes (`AUTH_`, `API_`, `DB_`) further group related vars.
- **Logging** — Fastify uses Pino (built-in). Use `request.log` in route handlers and hooks. Never use `console.log/error/warn` in production code. Services without request context use a module-level `pino()` instance. Error handlers should NOT duplicate Fastify's auto-logging — add structured context fields only. All log fields containing passwords/tokens must be added to the `redact` array in logger config.

### Documentation conventions

All **public** classes, methods, interfaces, exported functions, and type definitions MUST have JSDoc following the existing domain-layer pattern:

```typescript
/**
 * One-line purpose. If non-obvious, a second sentence explains *why*,
 * not *what* (the code structure makes *what* self-evident).
 *
 * @invariant Invariant condition enforced by the class (entities only).
 */
export class SomeEntity {
  /**
   * @param id - Unique identifier for this entity.
   * @param name - Display name shown in the UI.
   */
  constructor(
    /** Unique identifier for this entity. */
    public readonly id: SomeId,
    /** Display name shown in the UI. */
    public readonly name: string,
  ) {}

  /**
   * Brief description of what this method accomplishes when the method name
   * alone is insufficient. Omit the description sentence for trivial CRUD
   * methods where name + @param + @returns already communicate intent.
   *
   * @param paramName - Description of the parameter.
   * @returns Description of the return value.
   * @throws {ErrorType} When/why this error occurs.
   */
  method(paramName: string): SomeType { ... }
}
```

Rules:
- **Every public class, interface, type alias, and exported function** gets a JSDoc block. DTOs and simple type aliases need only a one-line purpose.
- **Every public method** gets `@param` + `@returns` + `@throws` tags. Add a leading description sentence only when the method's behavior isn't fully captured by its name plus its tags.
- **`@param`** uses dash-separator: `@param name - Description.` No type annotation (TypeScript handles that).
- **`@returns`** and **`@throws`** are always included for public methods. Use `@returns A promise that resolves when the operation completes.` for `Promise<void>` returns. Omit `@returns` only for plain `void` methods.
- **`@invariant`** on entity classes listing constructor-enforced invariants.
- **Inline `/** doc *\/`** comments on constructor `public readonly` parameters are preferred over separate `@param` tags for simple field descriptions.
- **Constructor `@param`** tags are used when the parameter needs contextual explanation beyond what fits inline.
- **File-level**: Use `@packageDocumentation` in package barrel `index.ts` files. Use `@file` in non-barrel index files that re-export.
- **Tag ordering**: `@param` (in argument order), then `@returns`, then `@throws`.
- **Blank line before tags**: Always insert an empty line (a bare ` *`) between the description paragraph and the first `@param`/`@returns`/`@throws` tag. Do NOT put tags on the line immediately after description text. Tags-only blocks (no description) need no blank line.
- Use backticks for code references, end sentences with periods.
- **Infrastructure layer** (repository implementations, persistence helpers) must be documented same as domain — no exceptions.
- Private/internal helpers with obvious behavior need no JSDoc. Add one when the implementation has non-obvious side effects or safety invariants (e.g., `extractMetadata`).
- Follow the "why, not what" principle: if the code already makes the behavior obvious, the comment explains the rationale or non-obvious side effects.

### Key design decisions

- `CreateProjectUseCase` does NOT verify actor exists — API layer responsibility
- `FileNode.move()` creates new node (immutable) — old node replaced in storage
- Recursive folder deletion uses iterative DFS with explicit stack — no stack overflow risk
- Actor validation for admin-only operations uses `callerMembership.role.value !== 'administrator'` check
- Owner cannot be removed, owner's role cannot be changed, last admin cannot be removed/demoted
- `docs/superpowers/specs/2026-05-26-asciidocollab-architecture-design.md` has the full architecture spec

## Phase 3 Implementation Summary

Phase 3 (Configurable Email Sender + Security) is **complete and merged to master**.

### What was built

- **NodemailerEmailSender**: SMTP-based email implementation in `packages/infrastructure/src/services/`
- **Configurable email**: `ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED` env var to enable/disable email sending
- **Breach blocking**: Registration and password change rejected when password is in breach database (FR-008, FR-010)
- **Constant-time login**: Prevents timing attacks that could enumerate valid emails
- **Constant-time password reset**: Prevents timing attacks that could enumerate valid emails
- **Graceful degradation**: All auth flows work without email when disabled

### Key files

| File | Purpose |
|------|---------|
| `packages/infrastructure/src/services/nodemailer-email-sender.ts` | SMTP email sender implementation |
| `packages/domain/src/use-cases/login.ts` | Constant-time login with `LOGIN_DELAY_MS` |
| `packages/domain/src/use-cases/request-password-reset.ts` | Constant-time password reset with `PASSWORD_RESET_DELAY_MS` |
| `packages/domain/src/use-cases/register-user.ts` | Breach blocking for registration |
| `packages/domain/src/use-cases/change-password.ts` | Breach blocking for password change |
| `packages/domain/src/constants.ts` | Timing constants (`LOGIN_DELAY_MS`, `PASSWORD_RESET_DELAY_MS`) |
| `apps/api/src/index.ts` | Wires NodemailerEmailSender based on config |

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED` | `true` | Enable/disable email sending |
| `ASCIIDOCOLLAB_AUTH_EMAIL_FROM` | required | Sender email address (required when enabled) |
| `ASCIIDOCOLLAB_AUTH_SMTP_HOST` | - | SMTP server host |
| `ASCIIDOCOLLAB_AUTH_SMTP_PORT` | `587` | SMTP server port |
| `ASCIIDOCOLLAB_AUTH_SMTP_USER` | - | SMTP authentication user |
| `ASCIIDOCOLLAB_AUTH_SMTP_PASSWORD` | - | SMTP authentication password |

### Security considerations

- **Timing attacks**: Login and password reset use constant-time responses (500ms delay)
- **Breach check**: Non-blocking — failures don't prevent registration/password change
- **Email disabled**: Breach check still runs even when email is disabled
- **Config validation**: App fails fast at startup if email enabled but `FROM` not set
