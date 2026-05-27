# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AsciiDocCollab is a browser-based collaborative AsciiDoc editor supporting real-time multi-user editing, project and file management, Git integration, HTML live preview, and PDF generation. It targets both self-hosted and SaaS deployments.

**Status:** Pre-implementation. The architecture spec lives at `docs/superpowers/specs/2026-05-26-asciidocollab-architecture-design.md` and functional requirements at `documentation/requirements/functional-requirements.md`. No application code exists yet.

## Planned Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Code editor | CodeMirror 6 + `y-codemirror.next` |
| HTML preview | Asciidoctor.js (Web Worker, client-side) |
| API server | Fastify + TypeScript |
| Real-time CRDT | Yjs |
| Collaboration server | Hocuspocus (standalone process) |
| PDF generation | Asciidoctor-PDF (Ruby sidecar container) |
| Database | PostgreSQL via Prisma ORM |
| Auth | Passport.js + passport-saml (local + SAML 2.0 + Entra ID) |
| Monorepo | pnpm workspaces |
| Tests | Jest + Testing Library + Playwright (E2E) |

## Monorepo Structure (to be built)

```
asciidocollab/
├── apps/
│   ├── web/          # Next.js 14 — delivery layer only
│   └── api/          # Fastify — delivery layer only
├── packages/
│   ├── domain/       # Entities, use cases, repository interfaces — zero external deps
│   ├── infrastructure/  # Prisma repos, filesystem, DockerGitAdapter, RubySidecarPdfAdapter
│   ├── collaboration/   # Hocuspocus standalone server
│   ├── shared/       # DTOs, error types, shared TS interfaces
│   └── db/           # Prisma schema, migrations, generated client
├── docker/
│   ├── git-sandbox/  # Dockerfile for sandboxed git operations
│   └── pdf/          # Dockerfile for Asciidoctor-PDF Ruby service
├── docker-compose.yml
└── pnpm-workspace.yaml
```

## Development Commands (once implemented)

```bash
pnpm install              # install all workspace dependencies
pnpm dev                  # start all services (web:3000, api:4000, collab:4001)
pnpm build                # build all packages
pnpm test                 # run all tests
pnpm test --filter=domain # run tests for a specific package
pnpm lint                 # lint all packages
pnpm db:migrate           # apply Prisma migrations
pnpm db:generate          # regenerate Prisma client after schema changes
```

## Architecture Principles

### Clean Architecture — strict dependency rule

Dependencies flow strictly inward: `domain` ← `infrastructure` ← `apps/*`.

- `packages/domain` has **zero external dependencies** — no Prisma, no Fastify, no filesystem imports.
- `packages/infrastructure` implements domain interfaces; domain never imports infrastructure.
- Cross-boundary communication uses DTOs from `packages/shared`.
- Dependency injection wires concrete implementations to domain interfaces at startup in `apps/`.

### Error handling

- Domain errors are typed value objects (e.g. `ProjectNotFoundError`, `PermissionDeniedError`). Never throw raw strings or generic `Error` in domain or application layers.
- Use cases return `Result<T, DomainError>` (discriminated union) — no exception-driven control flow.
- Infrastructure adapters catch external errors at the adapter boundary and map them to domain error types.
- Fastify's error handler maps domain errors to HTTP status codes and structured JSON.

### Testing

- Domain use cases are tested with **in-memory fakes** (not mocks) of repository interfaces.
- Infrastructure adapters use integration tests against real DB/filesystem via `testcontainers`.
- E2E via Playwright.

## Key Architectural Decisions

**Git sandboxing (FR-011):** Each git operation spawns a short-lived Docker container from `docker/git-sandbox`. The container mounts only the requesting project's directory. Credentials are injected as environment variables — never written to disk.

**HTML preview:** Asciidoctor.js runs in a dedicated Web Worker. Preview does not auto-render on every keystroke; user explicitly clicks Refresh. This avoids blocking the editor thread.

**Collaboration:** Hocuspocus maps each open document to a room keyed by `documentId`. On WebSocket connect, Hocuspocus calls the Fastify API to verify the user has at least `viewer` access before accepting the connection. Yjs state is persisted to filesystem as `.yjs` binary files.

**Project creation invariant:** Creating a project always runs a single DB transaction: insert Project (rootFolderId=null) → insert root FileNode → update Project.rootFolderId. Every project always has a root folder.

**RBAC:** Roles (viewer/editor/administrator) are assigned per project via `ProjectMember`. Global admins are a separate flag on `User`. Role checks happen in use cases, not in route handlers.

## Phased Delivery

| Phase | Scope |
|---|---|
| 1 | Monorepo scaffold + domain layer (entities, value objects, use cases — pure TS, in-memory-tested) |
| 2 | Database layer (Prisma schema, migrations, Prisma repository implementations) |
| 3 | API server + local authentication (Fastify, sessions, login/logout/register) |
| 4 | Project management (CRUD + member management — API + dashboard UI) |
| 5 | File management (file tree CRUD, drag-drop — API + file tree panel) |
| 6 | SAML authentication (passport-saml, Entra ID SSO, user provisioning) |
| 7 | Code editor (CodeMirror 6, AsciiDoc Lezer grammar, editor chrome) |
| 8 | HTML preview + auto-save (Asciidoctor.js Web Worker, sync state indicator) |
| 9 | Collaboration server (Hocuspocus, per-document rooms, auth hook, Yjs persistence) |
| 10 | Real-time co-editing (y-codemirror.next, presence indicators, collaborative undo/redo) |
| 11 | Git sandbox + core operations (Docker sandbox, clone/pull/push/commit/branch switch) |
| 12 | Merge/pull requests (GitHub, GitLab, Bitbucket provider REST adapters) |
| 13 | PDF generation (Ruby sidecar, Asciidoctor-PDF, theme + extension selection) |
| 14 | Templates + image management (built-in templates, custom templates, image upload/versions) |
| 15 | Enterprise security (MFA/TOTP, IP restrictions, audit log, performance hardening) |

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
