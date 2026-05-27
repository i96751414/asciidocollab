# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AsciiDocCollab is a browser-based collaborative AsciiDoc editor supporting real-time multi-user editing, project and
file management, Git integration, HTML live preview, and PDF generation. It targets both self-hosted and SaaS
deployments.

**Status:** Phase 1 complete — monorepo scaffolded and domain layer built. See `specs/001-domain-layer-scaffold/plan.md`
for the implementation plan and `docs/superpowers/specs/2026-05-26-asciidocollab-architecture-design.md` for the full
architecture spec.

## Tech Stack

| Layer                   | Technology                                                |
|-------------------------|-----------------------------------------------------------|
| Frontend                | Next.js 14 (App Router) + TypeScript                      |
| Code editor             | CodeMirror 6 + `y-codemirror.next`                        |
| HTML preview            | Asciidoctor.js (Web Worker, client-side)                  |
| API server              | Fastify + TypeScript                                      |
| Real-time CRDT          | Yjs                                                       |
| Collaboration server    | Hocuspocus (standalone process)                           |
| PDF generation          | Asciidoctor-PDF (Ruby sidecar container)                  |
| Database                | PostgreSQL via Prisma ORM                                 |
| Auth                    | Passport.js + passport-saml (local + SAML 2.0 + Entra ID) |
| Monorepo                | pnpm workspaces                                           |
| Tests                   | Jest + Testing Library + Playwright (E2E)                 |
| Architecture validation | fresh-onion                                               |

## Monorepo Structure

```
asciidocollab/
├── apps/
│   ├── web/          # Next.js 14 — delivery layer only (shell for Phase 4+)
│   └── api/          # Fastify — delivery layer only (shell for Phase 3+)
├── packages/
│   ├── domain/       # Entities, use cases, repository interfaces — zero external deps ✅ DONE
│   ├── infrastructure/  # Prisma repos, filesystem, Docker adapters (shell for Phase 2+)
│   ├── collaboration/   # Hocuspocus standalone server (shell for Phase 9+)
│   ├── shared/       # Result<T,E> type, DTOs ✅ DONE
│   └── db/           # Prisma schema, migrations (shell for Phase 2+)
├── specs/
│   └── 001-domain-layer-scaffold/  # Phase 1 plan, spec, data model, tasks
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

## Code Conventions (established in Phase 1)

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

### Project Structure

```
packages/domain/src/
├── entities/        # 9 entity classes + barrel index
├── value-objects/   # 19 VO classes + barrel index
├── errors/          # 16 error classes + barrel index
├── repositories/    # 9 repository interfaces + barrel index
├── use-cases/       # 7 use cases + barrel index
└── index.ts         # barrel export
```

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

## Phased Delivery

| Phase | Scope                                                                                             | Status         |
|-------|---------------------------------------------------------------------------------------------------|----------------|
| 1     | Monorepo scaffold + domain layer (entities, value objects, use cases — pure TS, in-memory-tested) | ✅ **Complete** |
| 2     | Database layer (Prisma schema, migrations, Prisma repository implementations)                     | ⬜ Pending      |
| 3     | API server + local authentication (Fastify, sessions, login/logout/register)                      | ⬜ Pending      |
| 4     | Project management (CRUD + member management — API + dashboard UI)                                | ⬜ Pending      |
| 5     | File management (file tree CRUD, drag-drop — API + file tree panel)                               | ⬜ Pending      |
| 6     | SAML authentication (passport-saml, Entra ID SSO, user provisioning)                              | ⬜ Pending      |
| 7     | Code editor (CodeMirror 6, AsciiDoc Lezer grammar, editor chrome)                                 | ⬜ Pending      |
| 8     | HTML preview + auto-save (Asciidoctor.js Web Worker, sync state indicator)                        | ⬜ Pending      |
| 9     | Collaboration server (Hocuspocus, per-document rooms, auth hook, Yjs persistence)                 | ⬜ Pending      |
| 10    | Real-time co-editing (y-codemirror.next, presence indicators, collaborative undo/redo)            | ⬜ Pending      |
| 11    | Git sandbox + core operations (Docker sandbox, clone/pull/push/commit/branch switch)              | ⬜ Pending      |
| 12    | Merge/pull requests (GitHub, GitLab, Bitbucket provider REST adapters)                            | ⬜ Pending      |
| 13    | PDF generation (Ruby sidecar, Asciidoctor-PDF, theme + extension selection)                       | ⬜ Pending      |
| 14    | Templates + image management (built-in templates, custom templates, image upload/versions)        | ⬜ Pending      |
| 15    | Enterprise security (MFA/TOTP, IP restrictions, audit log, performance hardening)                 | ⬜ Pending      |

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
