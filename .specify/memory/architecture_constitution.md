# AsciiDoCollab Architecture Constitution

## Architecture Style

**Modular Monolith** with Clean Architecture layering.

```
apps/           ← Delivery (Fastify API, Next.js frontend)
packages/
  domain/       ← Business logic, entities, use cases, repository interfaces
  application/  ← Orchestration, DTOs, service coordination
  infrastructure/ ← Prisma repos, external adapters, Docker wrappers
  shared/       ← DTOs, error types, value objects crossing package boundaries
  db/           ← Prisma schema, generated client
```

---

## Layer Boundaries — Strict Dependency Rule

Dependencies flow strictly inward:

```
Domain ← Application ← Infrastructure ← Delivery
```

- `packages/domain` MUST have zero external dependencies — no Prisma, no Fastify, no
  filesystem, no framework imports of any kind.
- `packages/infrastructure` implements domain interfaces; domain MUST never import
  infrastructure.
- All cross-boundary communication MUST use DTOs defined in `packages/shared`.
- Dependency injection MUST wire concrete implementations to domain interfaces at the
  composition root in `apps/` — no service locators, no static singletons.
- The domain layer MUST define repository interfaces; infrastructure provides
  implementations.
- Use cases in the domain layer MUST orchestrate business logic without knowing the
  delivery mechanism (HTTP, WebSocket, CLI, etc.).

---

## Business Logic Placement

- Business rules live in **domain entities** and **use cases**.
- Use cases orchestrate domain logic; they MUST NOT contain infrastructure concerns.
- Controllers/handlers MUST delegate to use cases — no business logic in route handlers.
- Services in `infrastructure/` implement domain interfaces; they MUST NOT contain
  business rules.

---

## Contracts & Validation

- `packages/shared` MUST define all DTOs, shared error types, and interfaces that cross
  package boundaries. No two packages MAY independently define the same type.
- Input validation happens at the boundary: Fastify schema validation for API, Zod for
  frontend forms. The domain layer MUST NOT trust its inputs.
- `Result<T, E>` (discriminated union) MUST be used for all fallible operations in the
  domain and application layers. Exceptions are reserved for truly exceptional conditions.

---

## Data Access Rules

- Database access via Prisma ORM only. The Prisma schema lives in `packages/db`.
- All queries use the generated Prisma client — raw SQL or untyped queries are not
  permitted without documented justification.
- Repository interfaces are defined in `packages/domain`. Infrastructure provides
  Prisma-backed implementations.
- Every repository interface MUST have a corresponding in-memory fake in the test suite.

---

## Async & Integration Rules

- Docker sandbox containers MUST be used for all git operations (FR-011). No git
  commands execute on the host machine.
- Real-time collaborative editing via Yjs `Y.Text` with Hocuspocus server.
- PDF generation via Asciidoctor-PDF Ruby sidecar (spawned per-render).

---

## Module Boundaries

- Each package owns its internal structure. Cross-package access uses public interfaces
  only.
- `packages/domain` is the dependency root — no other package may inject dependencies
  into it.
- Feature modules in `apps/` wire everything together at the composition root.

---

## Test File Layout

Tests MUST live in a dedicated `tests/` directory at the package or app root, mirroring the source directory structure. Co-located `__tests__` directories are **prohibited**.

### Canonical paths

| Package / App | Source root | Test root |
|---|---|---|
| `packages/domain` | `packages/domain/src/` | `packages/domain/tests/` |
| `packages/infrastructure` | `packages/infrastructure/src/` | `packages/infrastructure/tests/` |
| `apps/api` | `apps/api/src/` | `apps/api/tests/` |
| `apps/web` | `apps/web/src/` | `apps/web/tests/` |

### Structure mirrors source

A test for `apps/api/src/routes/users/keybindings.ts` lives at `apps/api/tests/routes/keybindings.test.ts`. A test for `apps/web/src/hooks/useKeyBindings.ts` lives at `apps/web/tests/hooks/useKeyBindings.test.ts`. The `src/` segment is dropped; the rest of the path is preserved.

### Rules

- MUST NOT create `__tests__/` directories anywhere in the repository.
- MUST NOT place test files alongside source files.
- Task descriptions that reference test file paths MUST use the `tests/` root convention above.
- When `/speckit-analyze` detects a test path using `__tests__` in tasks.md or plan.md, it MUST flag it as a **MEDIUM** inconsistency finding.

---

## Blocking Architecture Violations (P0)

The following violations MUST block merge:

1. Domain layer imports from infrastructure, application, or delivery layers.
2. Business logic in route handlers or controllers.
3. Repository interfaces missing from domain layer.
4. Cross-package type duplication (same type defined in multiple packages).
5. `any` type in production code.
6. `as` casts in production code.
7. Test files placed in `__tests__/` directories or co-located with source files.

---

## Architecture Evolution Policy

Architecture rules may evolve over time. When repeated drift is detected:

- Generate Constitution Update Proposals targeting this file.
- Proposals MUST explain the drift, impact, and proposed evolution.
- Require explicit approval before any rule changes.
- NEVER automatically modify this file.

---

## Refactor & Drift Handling

- Violations become refactor tasks unless marked P0 (blocking).
- Prefer incremental, module-by-module migration over full rewrites.
- Document accepted deviations with rationale and rollback plan.

---

## Technology Mandates

| Constraint             | Rule                                      | Enforcement                                                            |
|------------------------|-------------------------------------------|------------------------------------------------------------------------|
| Database               | PostgreSQL via Prisma ORM                 | Prisma schema in `packages/db`; all queries via generated client       |
| Monorepo tooling       | pnpm workspaces                           | `pnpm-workspace.yaml` defines the workspace                            |
| Code editor            | CodeMirror 6                              | Only CodeMirror 6 + y-codemirror.next for collaborative editing        |
| Real-time CRDT         | Yjs                                       | All collaborative text editing via Yjs `Y.Text`; Hocuspocus for server |
| PDF generation         | Asciidoctor-PDF (Ruby sidecar)            | Ruby container spawned per-render; no JS-based PDF fallback            |
| API framework          | Fastify                                   | Schema-first validation for all routes                                 |
| Frontend framework     | Next.js 16 (App Router)                   | Dashboard/auth via SSR; editor as client component                     |
| Component library      | shadcn/ui + Radix UI + Tailwind CSS       | Design tokens as CSS custom properties; light/dark themes              |
| Test runner            | Jest + Testing Library (unit/integration) | Jest for all Node.js tests; Playwright for E2E                         |
| Domain testing         | In-memory fakes                           | Every domain repository has an in-memory fake in the test suite        |
| Infrastructure testing | testcontainers                            | Integration tests spin up real PostgreSQL/Docker containers            |

**Version**: 2.2.0 | **Ratified**: 2026-05-27 | **Last Amended**: 2026-06-02
