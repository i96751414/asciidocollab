<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan at
specs/007-phase5-auth-ui/plan.md
<!-- SPECKIT END -->

## Project

AsciiDoCollab is a browser-based collaborative AsciiDoc editor supporting real-time multi-user editing, project and
file management, Git integration, HTML live preview, and PDF generation. It targets both self-hosted and SaaS
deployments.

**Status:** Phase 4 complete — project management CRUD + member management (API + dashboard UI).
See `specs/004-project-management/plan.md` for the implementation plan.

## Tech Stack

| Layer                   | Technology                                                |
|-------------------------|-----------------------------------------------------------|
| Frontend                | Next.js 16 (App Router) + TypeScript 6                    |
| Code editor             | CodeMirror 6 + `y-codemirror.next`                        |
| HTML preview            | Asciidoctor.js (Web Worker, client-side)                  |
| API server              | Fastify + TypeScript 6                                    |
| Real-time CRDT          | Yjs                                                       |
| Collaboration server    | Hocuspocus (standalone process)                           |
| PDF generation          | Asciidoctor-PDF (Ruby sidecar container)                  |
| Database                | PostgreSQL via Prisma ORM                                 |
| Auth                    | Passport.js + passport-saml (local + SAML 2.0 + Entra ID) |
| Email                   | Nodemailer (SMTP)                                         |
| Monorepo                | pnpm workspaces                                           |
| Tests                   | Jest + Testing Library + Playwright (E2E)                 |
| Architecture validation | fresh-onion                                               |

## Monorepo Structure

```
asciidocollab/
├── apps/
│   ├── web/          # Next.js 16 — delivery layer only (shell for Phase 4+)
│   └── api/          # Fastify — delivery layer only
├── packages/
│   ├── domain/            # Entities, use cases, repository interfaces — zero external deps ✅ DONE
│   ├── infrastructure/    # Prisma repos, filesystem, Docker adapters, email sender ✅ DONE
│   ├── collaboration/     # Hocuspocus standalone server (shell for Phase 9+)
│   ├── shared/            # Result<T,E> type, DTOs ✅ DONE
│   ├── db/                # Prisma schema, migrations ✅ DONE
│   └── testing/           # Testcontainers helper, factories, shared test setup ✅ DONE
├── specs/
│   ├── 004-project-management/  # Phase 4 implementation plan
│   ├── 005-configurable-mailer/  # Email sender + security feature
│   └── 006-project-management/   # Project management plan
└── pnpm-workspace.yaml
```

## Development Commands

```bash
pnpm install              # install all workspace dependencies
pnpm build                # build all packages
pnpm test                 # run all tests
pnpm test --filter=domain # run tests for a specific package
pnpm test:coverage        # run tests with coverage
pnpm typecheck            # TypeScript type-checking
pnpm lint                 # lint all packages
pnpm fresh-onion          # validate architecture boundaries
```

## Architecture Principles

### Clean Architecture — strict dependency rule

Dependencies flow strictly inward: `domain` ← `infrastructure` ← `apps/*`.

- `packages/domain` has **zero external dependencies** — no Prisma, no Fastify, no filesystem imports.
- `packages/infrastructure` implements domain interfaces; domain never imports infrastructure.
- Cross-boundary communication uses DTOs from `packages/shared`.
- Dependency injection wires concrete implementations to domain interfaces at startup in `apps/`.
- Architectural boundaries are enforced by fresh-onion in CI.

### Error handling

- Domain errors are typed value objects extending `DomainError` (e.g. `ProjectNotFoundError`, `PermissionDeniedError`).
  Never throw raw strings or generic `Error` in domain or application layers.
- Value objects throw `ValidationError extends DomainError` on bad input (programmer errors, not control flow).
- Use cases return `Result<T, DomainError>` (discriminated union) — no exception-driven control flow.
- Infrastructure adapters catch external errors at the adapter boundary and map them to domain error types.
- Fastify's error handler maps domain errors to HTTP status codes and structured JSON.

### Testing

- Domain use cases are tested with **in-memory fakes** (not mocks) of repository interfaces.
- Infrastructure adapters use integration tests against real DB/filesystem via `testcontainers`.
- E2E via Playwright.

## Code Conventions

### Value Objects

- Use `static create()` factory method with a `private constructor`.
- Validate input in `create()`, throw `ValidationError` on failure.
- Expose `.value` getter for the wrapped primitive.
- Implement `.equals(other: unknown): boolean` via `instanceof`.
- **UUID IDs**: Extend the `Uuid` abstract base class. `Uuid.equals()` uses constructor comparison to prevent cross-type
  equality (e.g. `UserId` !== `AuditLogId` even with same UUID string).

### Timestamps

- Use the `Timestamps` value object for `createdAt`/`updatedAt` pairs.
- Timestamps stores private `Date` fields and returns defensive copies from getters.
- Entity getters delegate to `this.timestamps.createdAt` / `this.timestamps.updatedAt`.

### Entities

- Validate invariants in the constructor. Throw `Error` for programmer errors (not returned as Result).
- Accept `Timestamps` as a single constructor parameter (defaults to `new Timestamps()`).
- Provide `.createdAt` and `.updatedAt` getters that delegate to timestamps.

### Use Cases

- Every `execute()` method returns `Promise<Result<T, DomainError>>`.
- Never throw exceptions for control flow.
- Use `actorId` as the parameter name for the acting user (all ID params use `Id` suffix).
- Permission checks use `role.value !== 'administrator'` pattern.
- Create `AuditLog` entries for all state-changing operations.
- Inject repository dependencies via constructor (no DI framework).

### In-Memory Fakes

- Stored in `packages/domain/tests/repositories/`.
- Backed by `Map<string, Entity>` keyed by `.value` of the ID.
- No mocking libraries — fakes are hand-written implementations.
- `save()` upserts into the map.
- Move/create patterns return new immutable entity instances.

### Environment Variables

All environment variables follow `ASCIIDOCOLLAB_CATEGORY_VARIABLE` convention (e.g.,
`ASCIIDOCOLLAB_DATABASE_URL`, `ASCIIDOCOLLAB_AUTH_SESSION_SECRET`). The `ASCIIDOCOLLAB_` prefix is the application
name; category prefixes (`AUTH_`, `API_`, `DB_`) further group related vars.

### Logging

Fastify uses Pino (built-in). Use `request.log` in route handlers and hooks. Never use
`console.log/error/warn` in production code. Services without request context use a module-level `pino()` instance.
Error handlers should NOT duplicate Fastify's auto-logging — add structured context fields only. All log fields
containing passwords/tokens must be added to the `redact` array in logger config.

### Documentation

All **public** classes, methods, interfaces, exported functions, and type definitions MUST have JSDoc following the
existing domain-layer pattern:

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

- **Every public class, interface, type alias, and exported function** gets a JSDoc block. DTOs and simple type aliases
  need only a one-line purpose.
- **Every public method** gets `@param` + `@returns` + `@throws` tags. Add a leading description sentence only when the
  method's behavior isn't fully captured by its name plus its tags.
- **`@param`** uses dash-separator: `@param name - Description.` No type annotation (TypeScript handles that).
- **`@returns`** and **`@throws`** are always included for public methods. Use
  `@returns A promise that resolves when the operation completes.` for `Promise<void>` returns. Omit `@returns` only for
  plain `void` methods.
- **`@invariant`** on entity classes listing constructor-enforced invariants.
- **Inline `/** doc *\/`** comments on constructor `public readonly` parameters are preferred over separate `@param`
  tags for simple field descriptions.
- **Constructor `@param`** tags are used when the parameter needs contextual explanation beyond what fits inline.
- **File-level**: Use `@packageDocumentation` in package barrel `index.ts` files. Use `@file` in non-barrel index files
  that re-export.
- **Tag ordering**: `@param` (in argument order), then `@returns`, then `@throws`.
- **Blank line before tags**: Always insert an empty line (a bare ` *`) between the description paragraph and the first
  `@param`/`@returns`/`@throws` tag. Do NOT put tags on the line immediately after description text. Tags-only blocks (
  no description) need no blank line.
- Use backticks for code references, end sentences with periods.
- **Infrastructure layer** (repository implementations, persistence helpers) must be documented same as domain — no
  exceptions.
- Private/internal helpers with obvious behavior need no JSDoc. Add one when the implementation has non-obvious side
  effects or safety invariants (e.g., `extractMetadata`).
- Follow the "why, not what" principle: if the code already makes the behavior obvious, the comment explains the
  rationale or non-obvious side effects.

## Key Architectural Decisions

**Git sandboxing (FR-011):** Each git operation spawns a short-lived Docker container from `docker/git-sandbox`. The
container mounts only the requesting project's directory. Credentials are injected as environment variables — never
written to disk.

**HTML preview:** Asciidoctor.js runs in a dedicated Web Worker. Preview does not auto-render on every keystroke; user
explicitly clicks Refresh. This avoids blocking the editor thread.

**Collaboration:** Hocuspocus maps each open document to a room keyed by `documentId`. On WebSocket connect, Hocuspocus
calls the Fastify API to verify the user has at least `viewer` access before accepting the connection. Yjs state is
persisted to filesystem as `.yjs` binary files.

**Project creation invariant:** Creating a project always runs a single DB transaction: insert Project (
rootFolderId=null) → insert root FileNode → update Project.rootFolderId. Every project always has a root folder.

**RBAC:** Roles (viewer/editor/administrator) are assigned per project via `ProjectMember`. Global admins are a separate
flag on `User`. Role checks happen in use cases, not in route handlers.

**Actor validation:** Use cases that require the actor to exist as a registered user delegate that check to the API
layer (e.g. session middleware), not to the domain use case itself.

## Phase 1 Implementation Summary

Phase 1 (Monorepo scaffold + domain layer) is **complete and merged to master**.

### What was built

- **9 entities**: User, Project, ProjectMember, FileNode, Document, Image, Template, GitRepository, AuditLog
- **19 value objects**: Uuid (base), 9 ID subclasses, Email, FilePath, Role, ProjectName, GitProvider, MimeType,
  FileNodeType, ContentId, YjsStateId, TemplateCategory, Timestamps
- **7 use cases**: create-project, rename-file, delete-file, invite-user, remove-member, change-member-role,
  get-project-tree
- **16 error classes**: DomainError (base), ProjectNotFoundError, UserNotFoundError, FileNodeNotFoundError,
  PermissionDeniedError, DuplicateEmailError, InvalidProjectNameError, FileConflictError,
  ProjectMemberAlreadyExistsError, CannotRemoveOwnerError, CannotChangeOwnerRoleError, CannotRemoveLastAdminError,
  CannotAttachDocumentToFolderError, CannotDeleteRootFolderError, MemberNotFoundError, ValidationError
- **9 repository interfaces** with in-memory fakes
- **Shared package**: Result<T,E> discriminated union + 7 DTOs
- **164 tests** across 18 test suites

## Phase 2 Implementation Summary

Phase 2 (Database layer) is **complete and merged to master**.

### What was built

- **2 new packages**: `packages/db` (Prisma schema + client) and `packages/infrastructure` (Prisma repository
  implementations)
- **Prisma schema**: 9 tables (User, Project, ProjectMember, FileNode, Document, Image, Template, GitRepository,
  AuditLog) with 3 enums (Role, FileNodeType, GitProvider), FK relationships with cascade rules, indexes, and `@db.Uuid`
  on all UUID columns
- **9 Prisma repository implementations**: PrismaUserRepository, PrismaProjectRepository, PrismaProjectMemberRepository,
  PrismaFileNodeRepository, PrismaDocumentRepository, PrismaImageRepository, PrismaTemplateRepository,
  PrismaGitRepositoryRepository, PrismaAuditLogRepository
- **Mapping layer**: `toDomain()` / `toPersistence()` helpers for all 9 entities, handling UUID string ↔ VO, Prisma
  enum ↔ domain VO, Date ↔ Timestamps, JSON ↔ AuditLog metadata
- **Integration test suite**: 9 test files covering all repositories against real PostgreSQL via testcontainers (
  postgres:16-alpine)
- **Test infrastructure**: Shared testcontainers helper and test data factories for all 9 entity types
- **Cross-cutting**: ESLint type assertion rules (`no-explicit-any: error`, `no-as-type-cast`), type mapping round-trip
  verification (13 tests)
- **All quality gates pass**: `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm fresh-onion`

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

| File                                                              | Purpose                                                        |
|-------------------------------------------------------------------|----------------------------------------------------------------|
| `packages/infrastructure/src/services/nodemailer-email-sender.ts` | SMTP email sender implementation                               |
| `packages/domain/src/use-cases/login.ts`                          | Constant-time login with `LOGIN_DELAY_MS`                      |
| `packages/domain/src/use-cases/request-password-reset.ts`         | Constant-time password reset with `PASSWORD_RESET_DELAY_MS`    |
| `packages/domain/src/use-cases/register-user.ts`                  | Breach blocking for registration                               |
| `packages/domain/src/use-cases/change-password.ts`                | Breach blocking for password change                            |
| `packages/domain/src/constants.ts`                                | Timing constants (`LOGIN_DELAY_MS`, `PASSWORD_RESET_DELAY_MS`) |
| `apps/api/src/index.ts`                                           | Wires NodemailerEmailSender based on config                    |

### Environment variables

| Variable                           | Default  | Description                                  |
|------------------------------------|----------|----------------------------------------------|
| `ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED` | `true`   | Enable/disable email sending                 |
| `ASCIIDOCOLLAB_AUTH_EMAIL_FROM`    | required | Sender email address (required when enabled) |
| `ASCIIDOCOLLAB_AUTH_SMTP_HOST`     | -        | SMTP server host                             |
| `ASCIIDOCOLLAB_AUTH_SMTP_PORT`     | `587`    | SMTP server port                             |
| `ASCIIDOCOLLAB_AUTH_SMTP_USER`     | -        | SMTP authentication user                     |
| `ASCIIDOCOLLAB_AUTH_SMTP_PASSWORD` | -        | SMTP authentication password                 |

### Security considerations

- **Timing attacks**: Login and password reset use constant-time responses (500ms delay)
- **Breach check**: Non-blocking — failures don't prevent registration/password change
- **Email disabled**: Breach check still runs even when email is disabled
- **Config validation**: App fails fast at startup if email enabled but `FROM` not set

## Phased Delivery

| Phase | Scope                                                                                             | Status         |
|-------|---------------------------------------------------------------------------------------------------|----------------|
| 1     | Monorepo scaffold + domain layer (entities, value objects, use cases — pure TS, in-memory-tested) | ✅ **Complete** |
| 2     | Database layer (Prisma schema, migrations, Prisma repository implementations)                     | ✅ **Complete** |
| 3     | Configurable email sender, breach blocking, timing attack prevention                              | ✅ **Complete** |
| 4     | Project management (CRUD + member management — API + dashboard UI)                                | ✅ **Complete** |
| 5     | File management (file tree CRUD, drag-drop — API + file tree panel)                               | ⬜ Pending      |
| 6     | Code editor (CodeMirror 6, AsciiDoc Lezer grammar, editor chrome)                                 | ⬜ Pending      |
| 7     | HTML preview + auto-save (Asciidoctor.js Web Worker, sync state indicator)                        | ⬜ Pending      |
| 8     | Collaboration server (Hocuspocus, per-document rooms, auth hook, Yjs persistence)                 | ⬜ Pending      |
| 9     | Real-time co-editing (y-codemirror.next, presence indicators, collaborative undo/redo)            | ⬜ Pending      |
| 10    | Git sandbox + core operations (Docker sandbox, clone/pull/push/commit/branch switch)              | ⬜ Pending      |
| 11    | Merge/pull requests (GitHub, GitLab, Bitbucket provider REST adapters)                            | ⬜ Pending      |
| 12    | PDF generation (Ruby sidecar, Asciidoctor-PDF, theme + extension selection)                       | ⬜ Pending      |
| 13    | Templates + image management (built-in templates, custom templates, image upload/versions)        | ⬜ Pending      |
| 14    | SAML authentication (passport-saml, Entra ID SSO, user provisioning)                              | ⬜ Pending      |
| 15    | Enterprise security (MFA/TOTP, IP restrictions, audit log, performance hardening)                 | ⬜ Pending      |
