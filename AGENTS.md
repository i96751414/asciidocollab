<!-- SPECKIT START -->
Active feature plan: specs/019-persist-file-selection/plan.md
<!-- SPECKIT END -->

## Hard Constraints (MUST NOT)

- MUST NOT create `CLAUDE.md` — this project uses `AGENTS.md` as the sole agent context file; update `AGENTS.md` instead
- MUST NOT `git push` or `git merge` without explicit user consent — commit freely, ask before pushing or merging
- MUST NOT use inline `eslint-disable` comments — fix the root cause instead
- MUST NOT use TypeScript `as X` assertions — `assertionStyle: 'never'` is enforced; use typed variable assignment or restructure the types instead
- MUST NOT name tests with task IDs (e.g. `[T042]`, `T-042`) — test names MUST describe behavior
- MUST NOT define `const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '...'` locally in hooks or components — import `API_BASE_URL` from `@/lib/api/file-content` (client-side) or use the local `API_BASE_URL` in server-side lib files
- MUST NOT add `@jest-environment` docblock pragma to `.tsx` test files — `.tsx` files automatically run in jsdom; the pragma is only valid in `.ts` test files that need a non-default environment
- MUST NOT create a test file without first verifying no test file already exists at an adjacent path
- MUST NOT throw raw strings or generic `Error` in domain or application layers — use typed `DomainError` subclasses
- MUST NOT import infrastructure, Prisma, or Fastify in `packages/domain`
- MUST NOT use `console.log/error/warn` in production code — use `request.log` (route handlers) or a module-level `pino()` instance
- MUST NOT skip tests — run the test suite for every package touched; a green typecheck is not a passing test suite

---

## Project

AsciiDoCollab is a browser-based collaborative AsciiDoc editor: real-time multi-user editing, project/file management, Git integration, HTML live preview, PDF generation. Targets self-hosted and SaaS deployments.

## Tech Stack

| Layer                   | Technology                                                |
|-------------------------|-----------------------------------------------------------|
| Frontend                | Next.js 16 (App Router) + TypeScript 6                    |
| Code editor             | CodeMirror 6 + `y-codemirror.next`                        |
| HTML preview            | Asciidoctor.js + highlight.js (Web Worker, client-side)   |
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
│   ├── web/                        # Next.js 16 — delivery layer
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (auth)/         # login, register, reset-password, verify-email, accept-invite
│   │       │   └── (dashboard)/
│   │       │       └── dashboard/
│   │       │           ├── page.tsx              # Project list
│   │       │           ├── account/              # Display name, email, password, keybindings
│   │       │           ├── admin/users/          # Admin user management
│   │       │           ├── archived/             # Archived projects
│   │       │           └── projects/
│   │       │               ├── new/              # Create project form
│   │       │               └── [id]/             # Project editor (3-panel layout)
│   │       │                   ├── page.tsx
│   │       │                   ├── project-editor-layout.tsx
│   │       │                   ├── members/      # Member management
│   │       │                   └── settings/     # Project settings + danger zone
│   │       ├── components/
│   │       │   ├── file-tree/      # FileTree, FileTreeNode, FileTreeActions, DragDropZone
│   │       │   ├── ui/             # shadcn/ui primitives (Button, Input, Card, etc.)
│   │       │   ├── asciidoc-preview.tsx   # Collapsible AsciiDoc → HTML preview
│   │       │   └── file-content-panel.tsx # Read-only file content display
│   │       ├── hooks/              # useFileTreeEvents, useFileSelection, useKeyBindings, etc.
│   │       ├── lib/api/            # fetch wrappers: file-tree, projects, assets
│   │       └── workers/            # file-tree-events.worker.ts (SharedWorker, SSE fan-out)
│   └── api/                        # Fastify — delivery layer
│       └── src/
│           ├── config/             # convict schema, formats
│           ├── plugins/            # auth, cors, csrf, rate-limit, file-tree-event-bus,
│           │                       # hocuspocus-persistence (draft), require-auth/admin
│           └── routes/
│               ├── projects/       # file-tree (GET/POST/PATCH/DELETE), file-content,
│               │                   # events (SSE), members, assets, users-search
│               └── ...             # auth, admin, user, health, keybindings routes
├── packages/
│   ├── domain/                     # Entities, use cases, ports — zero external deps
│   │   └── src/
│   │       ├── entities/           # 14 entities (User, Project, FileNode, Document, Asset, …)
│   │       ├── errors/             # 25+ typed DomainError subclasses
│   │       ├── ports/              # Grouped by domain subdirectory:
│   │       │   ├── admin/          # AuditLogRepository, SystemSettingRepository
│   │       │   ├── auth-tokens/    # PasswordResetToken, EmailChange, EmailVerification repos
│   │       │   ├── file-tree/      # FileNodeRepository, DocumentRepository, AssetRepository
│   │       │   ├── project/        # ProjectRepository, ProjectMemberRepository, etc.
│   │       │   ├── storage/        # ProjectFileStore, YjsStateStore
│   │       │   └── user/           # UserRepository, KeyBindingRepository, etc.
│   │       ├── services/           # EmailSender, PasswordHasher, BreachChecker, etc.
│   │       ├── use-cases/          # Grouped by domain subdirectory:
│   │       │   ├── auth/           # login, register, reset-password, verify-email, etc.
│   │       │   ├── content/        # get/save document content, upload-asset
│   │       │   ├── file-tree/      # create-file, create-folder, rename, delete, move, get-tree
│   │       │   ├── members/        # change-member-role, remove-member
│   │       │   ├── project/        # create, update, delete, archive, restore, list
│   │       │   └── settings/       # keybindings, open-registration, admin status
│   │       └── value-objects/      # 22 VOs including FileName (validates against path traversal,
│   │                               # control chars, Windows reserved names)
│   ├── infrastructure/             # Prisma repos, filesystem stores, email sender
│   ├── collaboration/              # Hocuspocus standalone server (shell — Phase 9+)
│   ├── shared/                     # Result<T,E> type, DTOs (FileTreeEventDto, etc.)
│   ├── db/                         # Prisma schema, migrations
│   └── testing/                    # Testcontainers helper, factories, shared test setup
├── specs/
│   └── <NNN>-<feature>/            # spec.md, plan.md, tasks.md, data-model.md, contracts/, research.md
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

## Test Execution Rules

Run tests for **every package touched**. Do not stop at typecheck.

| Package touched                                                    | Command to run                           |
|--------------------------------------------------------------------|------------------------------------------|
| `apps/web/src/` or `apps/web/tests/`                               | `pnpm --filter @asciidocollab/web test`  |
| `apps/api/src/` or `apps/api/tests/`                               | `cd apps/api && npx jest`                |
| `packages/domain/src/` or `packages/domain/tests/`                 | `cd packages/domain && npx jest`         |
| `packages/infrastructure/src/` or `packages/infrastructure/tests/` | `cd packages/infrastructure && npx jest` |
| `apps/web/e2e/`                                                    | Run E2E suite (see Pre-merge gate)       |

MUST NOT run `npx jest` from the repo root without `--filter` — it picks up configs from all workspace packages and produces misleading results.

### Pre-merge gate (all four jobs must pass with zero failures)

Run the whole gate locally with one command:

```bash
pnpm gate    # = scripts/ci-gate.sh — runs all four jobs below, stops on first failure
```

`pnpm gate` uses the **isolated** e2e job (`e2e-local.sh`), so it is safe to run while `scripts/dev.sh` is up — it never clashes on the dev ports or touches the dev database. **When asked to "run all quality gates with e2e", use `pnpm gate` (or `e2e-local.sh` for the e2e job) — never `ci-e2e.sh` while a dev stack is running** (see below). The individual jobs:

```bash
./scripts/ci-quality.sh      # Job 1: build · lint · types · architecture · audit
./scripts/ci-unit.sh         # Job 2: unit tests + coverage (needs Job 1)
./scripts/ci-integration.sh  # Job 3: integration tests via Testcontainers (needs Job 1)
./scripts/e2e-local.sh       # Job 4: E2E on an isolated stack (needs Jobs 2+3, requires Docker)
```

E2E tests are mandatory before merge — they are the only layer that catches missing route registrations and broken API contracts.

**`e2e-local.sh` (= `pnpm e2e:local`) vs `ci-e2e.sh`:** both run the *same* Playwright suite. `e2e-local.sh` spins up a throwaway Postgres + Mailpit from `docker-compose.e2e.yml` on distinct ports (5433/1126/8126, API 4100, web 3100, collab-internal 4101) and tears down — it never touches your dev containers, ports, or data, so it coexists with a running `dev.sh`. `ci-e2e.sh` is the **CI** form: it targets the dev stack (`docker-compose.dev.yml`, ports 4000/3000) and runs `prisma db push --force-reset`, so running it locally while `dev.sh` is up would `EADDRINUSE` on 4000/3000 and wipe the dev database. `scripts/e2e-stack-up.sh` brings the isolated stack **up and leaves it running** for iterating on individual specs.

Local e2e gotchas: (1) the isolated scripts offset the collab-internal port to 4101 so they coexist with a dev API on 4001; override `ASCIIDOCOLLAB_COLLAB_INTERNAL_PORT` if 4101 is also taken; (2) dev and e2e share `apps/web/.next`, so a stale `.next` (a prior `next dev` build mixed with `next build`) can make the served HTML reference chunks that 404→500 and pages won't hydrate (e.g. the register button stays disabled) — `rm -rf apps/web/.next` before building if you hit this; (3) never `DROP SCHEMA` on the e2e DB while the API is running (it corrupts the Prisma pool) — reset the DB before the API starts.

### Quick local check — `apps/web` only

```bash
pnpm --filter @asciidocollab/web test        # jest — all tests must pass
npx tsc -p apps/web/tsconfig.json --noEmit   # type-check (matches CI)
pnpm --filter @asciidocollab/web lint        # lint apps/web only
```

`next lint` was removed in Next.js 16. CI runs `npx eslint .` from the repo root. `pnpm --filter @asciidocollab/web lint` runs `eslint src/ tests/ e2e/` directly.

---

## Code Quality Rules

1. **No `eslint-disable`** — never add inline `eslint-disable` comments; fix the root cause.
2. **Test names describe behavior** — never include task IDs (`[T042]`, `T-042`) in test names.
3. **`API_BASE_URL` source** — never define `const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '...'` locally; import `API_BASE_URL` from `@/lib/api/file-content` in client-side hooks/components; use the local `API_BASE_URL` in server-side lib files.
4. **Jest environments in `apps/web`** — `.test.ts` files run in Node environment; `.test.tsx` files run in jsdom environment. No `@jest-environment` docblock pragma needed in `.tsx` files.
5. **No duplicate test files** — before creating a test file, verify no file already exists at an adjacent path.
6. **No TypeScript type assertions** — `assertionStyle: 'never'` is enforced; no `as X`; use typed variable assignment or restructure the types.
7. **`@jest-environment` is a Jest pragma, not a JSDoc tag** — only valid in `.ts` test files that need a different environment than the project default; `.tsx` files automatically run in jsdom.

---

## Architecture Principles

### Clean Architecture — strict dependency rule

Dependencies flow strictly inward: `domain` ← `infrastructure` ← `apps/*`.

- `packages/domain` has **zero external dependencies** — no Prisma, no Fastify, no filesystem imports.
- `packages/infrastructure` implements domain interfaces; domain never imports infrastructure.
- Cross-boundary communication uses DTOs from `packages/shared`.
- Dependency injection wires concrete implementations to domain interfaces at startup in `apps/`.
- Architectural boundaries are enforced by fresh-onion in CI.

### Error handling

- Domain errors are typed value objects extending `DomainError` (e.g. `ProjectNotFoundError`, `PermissionDeniedError`). Never throw raw strings or generic `Error` in domain or application layers.
- Value objects throw `ValidationError extends DomainError` on bad input (programmer errors, not control flow).
- Use cases return `Result<T, DomainError>` (discriminated union) — no exception-driven control flow.
- Infrastructure adapters catch external errors at the adapter boundary and map them to domain error types.
- Fastify's error handler maps domain errors to HTTP status codes and structured JSON.

### Testing

- Domain use cases: tested with **in-memory fakes** (not mocks) of repository interfaces.
- Infrastructure adapters: integration tests against real DB/filesystem via `testcontainers`.
- E2E: Playwright.

#### API route tests — every route needs an `app.inject()` test

Every `app.get/post/patch/delete()` registration in `apps/api/src/routes/` MUST have a corresponding test in `apps/api/tests/routes/` that makes real HTTP calls via `app.inject()`. The test must cover:

1. **Happy path** — correct status code and response shape
2. **Auth/permission errors** — 403 when caller is not a member
3. **Not-found errors** — 404 when the resource does not exist

Pattern (from `tests/routes/events.test.ts`):

```typescript
jest.mock('../../src/plugins/require-auth', () => ({
  requireAuth: jest.fn((_req, _rep, done) => done()),
  getAuthenticatedUserId: jest.fn(() => '550e8400-e29b-41d4-a716-446655440001'),
}));

async function buildTestServer() {
  const app = Fastify();
  app.decorate('repos', { /* mocked repos */ } as never);
  await app.register(myRoute);
  await app.ready();
  return app;
}

it('returns 200 for member', async () => {
  const app = await buildTestServer();
  const response = await app.inject({ method: 'GET', url: '/projects/550e8400-e29b-41d4-a716-446655440002/...' });
  expect(response.statusCode).toBe(200);
  await app.close();
});
```

**UUID invariant:** Test UUIDs must be valid UUID v4 — third group starts with `4`, fourth group starts with `[89ab]`. Example: `550e8400-e29b-41d4-a716-446655440001`. Invalid UUIDs cause `Uuid.create()` to throw `ValidationError` → 500, masking the real assertion.

#### Frontend component tests — fetch coverage rule

Any component that calls `fetch` MUST cover all three error paths:

| Case                     | Mock setup                        | What to assert                                         |
|--------------------------|-----------------------------------|--------------------------------------------------------|
| Success                  | `{ ok: true, json: () => data }`  | Data renders                                           |
| HTTP error (404, 500, …) | `{ ok: false, status: 404 }`      | Error state visible; UI is **not** stuck on "Loading…" |
| Network failure          | `mockRejectedValue(new Error(…))` | Error state visible; UI is **not** stuck on "Loading…" |

`response.ok === false` and a thrown exception are distinct code paths. Tests that only mock `ok: true` leave the `else` branch of `if (response.ok)` uncovered.

---

## Code Conventions

### Value Objects

- Use `static create()` factory with a `private constructor`.
- Validate input in `create()`, throw `ValidationError` on failure.
- Expose `.value` getter for the wrapped primitive.
- Implement `.equals(other: unknown): boolean` via `instanceof`.
- **UUID IDs**: Extend the `Uuid` abstract base class. `Uuid.equals()` uses constructor comparison to prevent cross-type equality (`UserId` !== `AuditLogId` even with same UUID string).

### Timestamps

- Use the `Timestamps` value object for `createdAt`/`updatedAt` pairs.
- Timestamps stores private `Date` fields and returns defensive copies from getters.
- Entity getters delegate to `this.timestamps.createdAt` / `this.timestamps.updatedAt`.

### Entities

- Validate invariants in the constructor. Throw `Error` for programmer errors (not returned as Result).
- Accept `Timestamps` as a single constructor parameter (defaults to `new Timestamps()`).
- Provide `.createdAt` and `.updatedAt` getters delegating to timestamps.

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

### Environment Variables

All env vars follow `ASCIIDOCOLLAB_CATEGORY_VARIABLE` convention (e.g., `ASCIIDOCOLLAB_DATABASE_URL`, `ASCIIDOCOLLAB_AUTH_SESSION_SECRET`).

### Logging

Fastify uses Pino (built-in). Use `request.log` in route handlers. Never use `console.log/error/warn` in production code. Services without request context use a module-level `pino()` instance. All log fields containing passwords/tokens must be added to the `redact` array in logger config.

### Documentation

All **public** classes, methods, interfaces, exported functions, and type definitions MUST have JSDoc:

```typescript
/**
 * One-line purpose. Second sentence explains *why* if non-obvious.
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
   * @param paramName - Description of the parameter.
   * @returns Description of the return value.
   * @throws {ErrorType} When/why this error occurs.
   */
  method(paramName: string): SomeType { ... }
}
```

Rules:
- Every public class, interface, type alias, and exported function gets a JSDoc block.
- Every public method gets `@param` + `@returns` + `@throws` tags.
- `@param` uses dash-separator: `@param name - Description.` No type annotation (TypeScript handles that).
- `@returns` and `@throws` are always included for public methods. Omit `@returns` only for plain `void` methods.
- `@invariant` on entity classes listing constructor-enforced invariants.
- Inline `/** doc */` on constructor `public readonly` parameters preferred over separate `@param` tags.
- Tag ordering: `@param` (in argument order), then `@returns`, then `@throws`.
- Always insert an empty line between the description paragraph and the first tag.
- Use backticks for code references, end sentences with periods.
- Infrastructure layer must be documented same as domain — no exceptions.
- Private/internal helpers with obvious behavior need no JSDoc; add one when the implementation has non-obvious side effects or safety invariants.
- Every constructor parameter needs a `@param` tag or inline `/** doc */`; `jsdoc/require-param` runs with `checkConstructors: true`. Adding a param without documentation is a lint error.
- Descriptions must add information the name does not already convey. The linter strips the symbol name plus these structural words before judging: `interface type class hook function method handler component helper utility service manager object result`. Nothing remaining = lint error. WRONG: `/** Result interface for useBar hook. */` / `@param reply - The reply object.` RIGHT: `/** Exposes the current bar state and its setters. */` / `@param reply - Fastify reply used to send the error response.`

---

## Key Architectural Decisions

**Git sandboxing:** Each git operation spawns a short-lived Docker container from `docker/git-sandbox`. The container mounts only the requesting project's directory. Credentials are injected as environment variables — never written to disk.

**HTML preview:** Asciidoctor.js runs in a dedicated Web Worker (`apps/web/src/workers/asciidoc-render.worker.ts`) and auto-renders on a debounce (`PREVIEW_DEBOUNCE_MS`, 1500 ms) so typing never blocks the editor thread — there is no manual Refresh button. The worker post-processes Asciidoctor's HTML with highlight.js (`highlightCodeBlocks`) to add `.hljs-*` token spans to fenced source blocks; the result is sanitized by DOMPurify on the main thread before injection. Preview styling (`styles/asciidoc-preview.css`) is driven by the app's `--*` design tokens, so it follows light/dark theme automatically — never hard-code preview colors.

**Collaboration:** Hocuspocus maps each open document to a room keyed by `documentId`. On WebSocket connect, Hocuspocus calls the Fastify API to verify the user has at least `viewer` access. Yjs state is persisted to filesystem as `.yjs` binary files.

**yjs in a CJS package:** `apps/api` is `"type": "commonjs"`. `yjs` ships `"type": "module"` but provides a CJS build via its `"require"` export condition. TypeScript TS1479/TS1542 fires for static imports of `yjs` from a CJS file because yjs's `"types"` export condition points to an ESM `.d.ts`. Workaround in `hocuspocus-persistence.ts`: `require('yjs')` at the top level cast against a local minimal interface (`Yjs`/`YjsDoc`) declaring only the two needed functions.

**File-tree drag-and-drop (move):** Dragging a node onto a folder moves it (`MoveFileUseCase`); handlers live in `file-tree.tsx` (`handleTreeDragStart`) and `file-tree-node.tsx`. Two non-obvious cross-browser HTML5-DnD requirements — both bugs present as "drop does nothing": (1) guard the dragstart target with `instanceof Element`, **not** `HTMLElement` — browsers fire `dragstart` on the row's `<svg>` icon when grabbed there (WebKit always), and `SVGElement` is not an `HTMLElement`, so an `HTMLElement`-only guard silently skips `setData`; (2) set `effectAllowed`/`dropEffect` to `'move'` and give folders an `onDragEnter` that `preventDefault()`s, or Firefox/Safari resolve `dropEffect` to `none` and discard the drop. Note: Playwright (and synthetic event tests) paper over (2), so an e2e move test can pass while real users see nothing — cover the icon-grab case explicitly.

**SSE real-time file tree:** The API broadcasts `FileTreeEventDto` over a per-project in-memory `EventTarget` bus (`FileTreeEventBus` plugin). The frontend connects via a `SharedWorker` that holds one `EventSource` per project and fans events to all tabs. `applyEvent()` handles `created/deleted/renamed/moved` events locally; `onUpdate` (called after any mutation) triggers `fetchTree()` as a reliable fallback. `applyEvent` is idempotent for `created` events to prevent duplicates when refetch beats SSE delivery.

**Project creation invariant:** Creating a project always runs a single DB transaction: insert Project (rootFolderId=null) → insert root FileNode → update Project.rootFolderId. Every project always has a root folder.

**RBAC:** Roles (viewer/editor/administrator) are assigned per project via `ProjectMember`. Global admins are a separate flag on `User`. Role checks happen in use cases, not in route handlers.

**Actor validation:** Use cases that require the actor to exist as a registered user delegate that check to the API layer (e.g. session middleware), not to the domain use case itself.

---

## Speckit Architecture Files

| File                            | Purpose                                                  |
|---------------------------------|----------------------------------------------------------|
| `specs/<feature>/spec.md`       | Product specification (non-technical, user-facing)       |
| `specs/<feature>/plan.md`       | Implementation plan (tech stack, architecture decisions) |
| `specs/<feature>/data-model.md` | Frontend/backend data shapes for the feature             |
| `specs/<feature>/contracts/`    | Component prop contracts and hook interfaces             |
| `specs/<feature>/tasks.md`      | Ordered, dependency-tracked task list for implementation |
| `specs/<feature>/research.md`   | Technical research and ADRs                              |
| `.specify/`                     | Speckit internal configuration and extensions            |
| `onion.config.json`             | Architecture boundary configuration (fresh-onion)        |

The active plan is always referenced in the SPECKIT block at the top of this file. Run `/speckit-implement` to execute tasks from the current plan.

---

## Current Test Counts (as of Phase 018)

| Package                    | Tests |
|----------------------------|-------|
| `apps/web` (unit)          | 1092  |
| `apps/api` (unit)          | 391   |
| `packages/domain` (unit)   | 536   |
| `packages/infrastructure`  | 150   |
| `apps/collab` (unit)       | 52    |
| `packages/shared`          | 14    |
| `apps/web` (e2e)           | 79    |

> Known pre-existing gaps (not a regression of any single feature): `apps/web`
> jest coverage sits just under the configured 90/93/90 thresholds, and
> `packages/shared` reports 0% (it is types/DTOs only). The CI step
> `pnpm --filter @asciidocollab/web test -- --coverage` is also mis-quoted — the
> stray `--` makes jest treat `--coverage` as a path; run
> `pnpm --filter @asciidocollab/web exec jest --coverage` instead.

## Pending Phases

| Phase | Scope                                                                                  |
|-------|----------------------------------------------------------------------------------------|
| 8     | Collaboration server (Hocuspocus, per-document rooms, auth hook, Yjs persistence)      |
| 9     | Real-time co-editing (y-codemirror.next, presence indicators, collaborative undo/redo) |
| 10    | Git sandbox + core operations (Docker sandbox, clone/pull/push/commit/branch switch)   |
| 11    | Merge/pull requests (GitHub, GitLab, Bitbucket provider REST adapters)                 |
| 12    | PDF generation (Ruby sidecar, Asciidoctor-PDF, theme + extension selection)            |
| 13    | Templates + asset management (built-in templates, custom templates, image upload)      |
| 14    | SAML authentication (passport-saml, Entra ID SSO, user provisioning)                  |
| 15    | Enterprise security (MFA/TOTP, IP restrictions, audit log, performance hardening)      |
