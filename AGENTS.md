<!-- SPECKIT START -->
No active implementation plan.
<!-- SPECKIT END -->

## Agent Instructions

- **Do not create CLAUDE.md.** This project uses `AGENTS.md` as the single agent context file. If you find yourself
  about to write `CLAUDE.md`, write to `AGENTS.md` instead or update the relevant section here.
- All quality gate commands, project conventions, and architectural rules live in this file.
- **Never `git push` or `git merge` without explicit user consent.** Commit freely, but always ask before pushing or merging.

## Project

AsciiDoCollab is a browser-based collaborative AsciiDoc editor supporting real-time multi-user editing, project and
file management, Git integration, HTML live preview, and PDF generation. It targets both self-hosted and SaaS
deployments.

**Status:** Phase 6 complete — CodeMirror editor with auto-save, AsciiDoc syntax highlighting, table editing,
autocomplete, block title captions, image/include macros with file-path autocomplete, and Dracula/Tomorrow/Espresso
themes. All branches merged to `main`.

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
│   ├── domain/                     # Entities, use cases, ports — zero external deps ✅
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
│   │       └── value-objects/      # 22 VOs including new FileName (validates names against
│   │                               # path traversal, control chars, Windows reserved names)
│   ├── infrastructure/             # Prisma repos, filesystem stores, email sender ✅
│   ├── collaboration/              # Hocuspocus standalone server (shell — Phase 9+)
│   ├── shared/                     # Result<T,E> type, DTOs (FileTreeEventDto, etc.) ✅
│   ├── db/                         # Prisma schema, migrations ✅
│   └── testing/                    # Testcontainers helper, factories, shared test setup ✅
├── specs/
│   ├── 001-domain-layer-scaffold/  ✅ complete
│   ├── 002-database-layer/         ✅ complete
│   └── ...                         # 001–012, see Phased Delivery table for status
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

### After any code change

**Always run the tests for every package you touched.** Do not stop at typecheck.

| Package touched                                                    | Command to run                           |
|--------------------------------------------------------------------|------------------------------------------|
| `apps/web/src/` or `apps/web/tests/`                               | `pnpm --filter @asciidocollab/web test`  |
| `apps/api/src/` or `apps/api/tests/`                               | `cd apps/api && npx jest`                |
| `packages/domain/src/` or `packages/domain/tests/`                 | `cd packages/domain && npx jest`         |
| `packages/infrastructure/src/` or `packages/infrastructure/tests/` | `cd packages/infrastructure && npx jest` |
| `apps/web/e2e/`                                                    | Run E2E suite (see Pre-merge gate below) |

A green typecheck is not a passing test suite. Run both.

### Pre-merge gate (before any PR or merge to main)

All of the following must pass with zero failures:

```bash
# Unit + integration tests — all packages
pnpm --filter @asciidocollab/web check   # lint + typecheck + jest
cd apps/api && npx jest                  # API route tests
cd packages/domain && npx jest           # domain use-case tests
cd packages/infrastructure && npx jest  # Prisma integration tests

# E2E tests — requires dev stack running (./scripts/dev.sh)
pnpm --filter @asciidocollab/web e2e     # Playwright suite
```

**E2E tests are mandatory before merge.** They are the only layer that catches missing route registrations, broken API
contracts, and UI regressions that unit tests cannot see. A PR where E2E was not run is not ready to merge.

---

## Quality Gates for `apps/web`

**Always use `pnpm --filter` from the repo root.** Running `npx jest` or `npx eslint` from the repo root without
`--filter` picks up configs from all workspace packages and produces misleading results (e.g. 146 phantom test
failures).

```bash
# Run individually from repo root:
pnpm --filter @asciidocollab/web lint        # eslint src/ tests/ e2e/ — 0 violations required
pnpm --filter @asciidocollab/web typecheck   # tsc --noEmit — 0 errors required
pnpm --filter @asciidocollab/web test        # jest — all 176 tests must pass

# Or run all three in sequence:
pnpm --filter @asciidocollab/web check
```

**Why not `next lint`?** `next lint` was removed in Next.js 16. The `apps/web` lint script now runs
`eslint src/ tests/ e2e/` directly.

## Speckit Architecture Files

This project uses [speckit](https://github.com/speckit) for structured feature development. Key files:

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

The active plan is always referenced in the SPECKIT block at the top of this file. Run `/speckit-implement` to execute
tasks from the current plan.

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

#### API route tests — every route needs an `app.inject()` test

Every `app.get/post/patch/delete()` registration in `apps/api/src/routes/` **must** have a corresponding test in
`apps/api/tests/routes/` that makes real HTTP calls via `app.inject()`. The test must cover:

1. **Happy path** — correct status code and response shape
2. **Auth/permission errors** — 403 when caller is not a member
3. **Not-found errors** — 404 when the resource does not exist

**Pattern** (from `tests/routes/events.test.ts`):

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

**Important:** Test UUIDs must be valid **UUID v4** — third group starts with `4`, fourth group starts with `[89ab]`.
Example: `550e8400-e29b-41d4-a716-446655440001`. Invalid UUIDs cause the domain's `Uuid.create()` to throw
`ValidationError` → 500, masking the real assertion.

**Why:** The domain use case layer and the frontend component layer are both tested in isolation. Neither catches "the
route was never registered." Only an `app.inject()` test exercises the full registration → handler → use case → response
chain. This was the exact gap that caused `GET /projects/:id/files` to silently not exist in production.

#### Frontend component tests — fetch coverage rule

Any component that calls `fetch` **must** cover all three error paths, not just the happy path:

| Case                     | Mock setup                        | What to assert                                         |
|--------------------------|-----------------------------------|--------------------------------------------------------|
| Success                  | `{ ok: true, json: () => data }`  | Data renders                                           |
| HTTP error (404, 500, …) | `{ ok: false, status: 404 }`      | Error state visible; UI is **not** stuck on "Loading…" |
| Network failure          | `mockRejectedValue(new Error(…))` | Error state visible; UI is **not** stuck on "Loading…" |

**Why:** `response.ok === false` and a thrown exception are distinct code paths. Tests that only mock `ok: true` and
network rejection leave the `else` branch of `if (response.ok)` uncovered — the exact gap that caused the file tree to
hang on "Loading…" forever when the API returned 404.

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

## Phase 4 Implementation Summary

Phase 4 (Project management CRUD + member management) is **complete and merged to master**.
See `specs/006-project-management/` for details. Not reproduced here to keep file concise.

## Phase 4+ Implementation Summary (specs 007–010)

Auth UI, account forms, user registration management, and key bindings are **complete and merged to master**.
Covers: login/register/reset-password pages, account settings (display name, email, password, key bindings),
admin user management, open-registration toggle, invite-only mode, email verification flow.

## Phase 5 Implementation Summary

Phase 5 (File management + project page editor) is **complete** (active branch: `012-project-page-editor`).

### What was built

**API (`apps/api/src/routes/projects/`)**

- `GET /projects/:id/files` — full file tree with nested `parentId` fields
- `POST /projects/:id/files` — create file or folder; emits SSE `created` event
- `PATCH /projects/:id/files/:nodeId` — rename (name only), move (parentId only), or rename+move
- `DELETE /projects/:id/files/:nodeId` — delete file/folder (cascades children)
- `GET /projects/:id/events` — SSE stream for real-time file tree events (keepalive every 30s)
- `GET /projects/:id/files/:nodeId/content` — read file content
- `POST /projects/:id/assets` — binary asset upload
- `FileTreeEventBus` Fastify plugin — in-process pub/sub using DOM `EventTarget` per project

**Frontend (`apps/web/src/`)**

- `ProjectEditorLayout` — 3-panel layout: collapsible file tree (left), read-only content (centre),
  collapsible AsciiDoc preview (right); collapse state persisted to `sessionStorage`
- `FileTree` — fetches tree on mount; applies SSE events via `applyEvent()` (created/deleted/renamed/moved);
  refetches on `onUpdate` callback (after mutations) and `onReconnect` (after SSE disconnect)
- `FileTreeNode` — expand/collapse folders; forwards `onUpdate` prop to `FileTreeActions` and child nodes
- `FileTreeActions` — dropdown: New File / New Folder (folders only), Rename, Delete; all with Dialog UX
- `DragDropZone` — drag-and-drop target for move operations
- `AsciiDocPreview` — lazy-loads Asciidoctor.js; renders AsciiDoc → HTML; collapsible panel
- `FileContentPanel` — read-only content display; handles binary/text/loading/error states
- `file-tree-events.worker.ts` — SharedWorker holding one SSE `EventSource` per project;
  fans events to all tabs via `MessagePort`
- `useFileTreeEvents` hook — subscribes to SharedWorker; routes `file-tree-change` and `reconnect` messages

**Domain (`packages/domain/`)**

- `FileName` value object — validates file/folder names: rejects empty, leading/trailing whitespace,
  `.`, `..`, `/`, `\`, null bytes, newlines, Windows reserved device names (CON, NUL, etc.)
- `FilePath` — updated to allow spaces in file/folder names (regex: `[a-zA-Z0-9_\-. /]`)
- `FileName.create()` called at the start of `CreateFileUseCase`, `CreateFolderUseCase`, and
  `RenameFileUseCase` — invalid names throw `ValidationError` before path construction

**Key fixes and invariants**

- File/folder creation actions are restricted to folder nodes only (never shown on file nodes)
- SSE `created` events are idempotent in `applyEvent`: if the node already exists (e.g. from
  a refetch that beat SSE delivery), the second application is a no-op
- `apps/api/storage/` added to `.gitignore` (default `ASCIIDOCOLLAB_STORAGE_PATH`)

### Test counts (as of Phase 5)

| Package           | Tests |
|-------------------|-------|
| `apps/web`        | 176   |
| `apps/api`        | 140   |
| `packages/domain` | 431   |

## Phase 5+ Implementation Summary (spec 013)

Phase 5+ (File tree UX improvements) is **complete and merged to main** (`013-file-tree-ux`).

### What was built

- **Find-in-tree** — keyboard-shortcut-driven search within the file tree (debounced filter, highlight match)
- **Sort** — alphabetical sort toggle for folder contents
- **Error area** — dedicated UI zone for tree-level error messages (not inline toasts)
- **Keybinding** — configurable keyboard shortcut to open the file tree
- **Tree actions consolidation** — New File, New Folder, Rename, Delete collapsed into a single context menu per node;
  Create actions shown only on folder nodes
- **SSE real-time sync** — fixed reconnect and upload-bubble edge cases; drag-drop triggers tree refresh
- **Code quality** — ESLint cleanup, missing `DialogDescription` warning suppressed

## Phase 6 Implementation Summary (specs 014, 015)

Phase 6 (Code editor) is **complete and merged to main** across two branches: `014-codemirror-editor` and
`015-editor-tables-autocomplete`.

### What was built — 014

**Editor (`apps/web/src/`)**

- `AsciiDocEditor` — full CodeMirror 6 editor replacing the read-only content panel for editable (`.adoc`) files
- AsciiDoc Lezer grammar — syntax highlighting for headings, bold/italic, delimited blocks, tables, attribute
  references, macros, footnotes, STEM blocks, inline code; grammar tokenises `.adoc` files live
- Auto-save — 4-second debounce; `SaveIndicator` component shows `saved / unsaved changes / saving… / error` states;
  `beforeunload` guard prevents navigation with unsaved content
- Editor preferences — theme selector (Default, Dracula, Tomorrow, Espresso), line numbers toggle, word wrap toggle,
  font size control; preferences persisted to user settings via API
- `useEditorMount` hook — bootstraps the CodeMirror `EditorView`, wires extensions, and registers auto-save
- `EditorBanners` component — non-blocking notification when a file is externally updated while the editor is open
- Collaborative-ready — Yjs document slot reserved; `y-codemirror.next` extension scaffold in place for Phase 8

**API (`apps/api/src/routes/projects/`)**

- `GET /projects/:id/files/:nodeId/content` — already existed; confirmed used by editor for initial load
- `PUT /projects/:id/files/:nodeId/content` — new route; accepts raw text body, writes to `ProjectFileStore`,
  emits SSE `updated` event

### What was built — 015

- **Table autocomplete** — typing `|===` offers a snippet with header row + data row; `|` at line start inside a
  table block offers a new cell/row completion
- **Context toolbar** — when cursor is inside a `|===` block: Add row above/below, Remove row, Add column
  left/right, Remove column, Move column left/right; rewrites table text in-place, preserving column spec
- **Block title captions** — `.` prefix autocomplete for block titles (`.Caption text` before any delimited block)
- **Image/include macro autocomplete** — `image::`, `image:`, `include::` trigger file-path completion sourced from
  the project's file tree; only image extensions shown for `image::` macros
- **Editor themes** — Dracula, Tomorrow, and Espresso themes added as separate CM6 theme extensions; split into
  individual files under `src/lib/editor/themes/`
- **Dark-theme fix** — block macro tokens (image, include, xref) were invisible in dark themes; tokeniser updated

### Test counts (as of Phase 6)

| Package           | Tests |
|-------------------|-------|
| `apps/web`        | 454   |
| `apps/api`        | 149   |
| `packages/domain` | 594   |

## Key Architectural Decisions

**Git sandboxing (FR-011):** Each git operation spawns a short-lived Docker container from `docker/git-sandbox`. The
container mounts only the requesting project's directory. Credentials are injected as environment variables — never
written to disk.

**HTML preview:** Asciidoctor.js runs in a dedicated Web Worker. Preview does not auto-render on every keystroke; user
explicitly clicks Refresh. This avoids blocking the editor thread.

**Collaboration:** Hocuspocus maps each open document to a room keyed by `documentId`. On WebSocket connect, Hocuspocus
calls the Fastify API to verify the user has at least `viewer` access before accepting the connection. Yjs state is
persisted to filesystem as `.yjs` binary files.

**yjs in a CJS package:** `apps/api` is `"type": "commonjs"`. `yjs` ships `"type": "module"` but provides a CJS build
via its `"require"` export condition. TypeScript TS1479/TS1542 fires for any static or type import of `yjs` from a CJS
file because yjs's `"types"` export condition points to an ESM `.d.ts`. Workaround in `hocuspocus-persistence.ts`:
`require('yjs')` at the top level cast against a local minimal interface (`Yjs` / `YjsDoc`) that declares only the two
functions needed. This avoids the type errors while preserving type safety at the call sites.

**SSE real-time file tree:** The API broadcasts `FileTreeEventDto` over a per-project in-memory `EventTarget` bus
(`FileTreeEventBus` plugin). The frontend connects via a `SharedWorker` that holds one `EventSource` per project and
fans events to all tabs. `applyEvent()` handles `created/deleted/renamed/moved` events locally; `onUpdate` (called
after any mutation) triggers `fetchTree()` as a reliable fallback. `applyEvent` is idempotent for `created` events
to prevent duplicates when refetch beats SSE delivery.

**Project creation invariant:** Creating a project always runs a single DB transaction: insert Project (
rootFolderId=null) → insert root FileNode → update Project.rootFolderId. Every project always has a root folder.

**RBAC:** Roles (viewer/editor/administrator) are assigned per project via `ProjectMember`. Global admins are a separate
flag on `User`. Role checks happen in use cases, not in route handlers.

**Actor validation:** Use cases that require the actor to exist as a registered user delegate that check to the API
layer (e.g. session middleware), not to the domain use case itself.

## Phase 1–3 Implementation Summaries

Phases 1–3 are **complete and merged to master**. See `specs/001–005` for original plans.

Key outputs:

- **Phase 1** (`specs/001`): Domain layer — 14 entities, 22+ value objects (including `FileName`, `FilePath`,
  `YjsStateId`), 40+ use cases in domain-grouped subdirs (`auth/`, `content/`, `file-tree/`, etc.),
  25+ typed `DomainError` subclasses, `Result<T,E>` type, in-memory fakes for all ports.
- **Phase 2** (`specs/002`): Database layer — `packages/db` (Prisma schema), `packages/infrastructure`
  (Prisma repo implementations + `FilesystemProjectFileStore` + `FilesystemYjsStateStore`).
  Integration tests via testcontainers (postgres:16-alpine).
- **Phase 3** (`specs/003–005`): Fastify API with local auth (Passport.js), `convict` config, SMTP email
  (`NodemailerEmailSender`), breach blocking, constant-time login/reset, email verification flow.

### Phase 3 environment variables

| Variable                           | Default  | Description                            |
|------------------------------------|----------|----------------------------------------|
| `ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED` | `true`   | Enable/disable email sending           |
| `ASCIIDOCOLLAB_AUTH_EMAIL_FROM`    | required | Sender address (required when enabled) |
| `ASCIIDOCOLLAB_AUTH_SMTP_HOST`     | -        | SMTP server host                       |
| `ASCIIDOCOLLAB_AUTH_SMTP_PORT`     | `587`    | SMTP server port                       |
| `ASCIIDOCOLLAB_AUTH_SMTP_USER`     | -        | SMTP authentication user               |
| `ASCIIDOCOLLAB_AUTH_SMTP_PASSWORD` | -        | SMTP authentication password           |

## Phased Delivery

| Phase | Scope                                                                                             | Status         |
|-------|---------------------------------------------------------------------------------------------------|----------------|
| 1     | Monorepo scaffold + domain layer (entities, value objects, use cases — pure TS, in-memory-tested) | ✅ **Complete** |
| 2     | Database layer (Prisma schema, migrations, Prisma repository implementations)                     | ✅ **Complete** |
| 3     | API auth, configurable email, breach blocking, timing-attack prevention                           | ✅ **Complete** |
| 4     | Project management CRUD + member management (API + dashboard UI)                                  | ✅ **Complete** |
| 4+    | Auth UI, account forms, user registration/management, key bindings (specs 007–010)                | ✅ **Complete** |
| 5     | File management: file tree CRUD, SSE real-time updates, project page editor, AsciiDoc preview     | ✅ **Complete** |
| 5+    | File tree UX: find-in-tree, sort, consolidated actions menu, SSE fixes (spec 013)                 | ✅ **Complete** |
| 6     | Code editor: CodeMirror 6, AsciiDoc syntax highlighting, auto-save, themes (spec 014)             | ✅ **Complete** |
| 6+    | Editor tables, context toolbar, block captions, image/include autocomplete (spec 015)             | ✅ **Complete** |
| 7     | HTML preview + auto-save (Asciidoctor.js Web Worker, sync state indicator)                        | ⬜ Pending      |
| 8     | Collaboration server (Hocuspocus, per-document rooms, auth hook, Yjs persistence)                 | ⬜ Pending      |
| 9     | Real-time co-editing (y-codemirror.next, presence indicators, collaborative undo/redo)            | ⬜ Pending      |
| 10    | Git sandbox + core operations (Docker sandbox, clone/pull/push/commit/branch switch)              | ⬜ Pending      |
| 11    | Merge/pull requests (GitHub, GitLab, Bitbucket provider REST adapters)                            | ⬜ Pending      |
| 12    | PDF generation (Ruby sidecar, Asciidoctor-PDF, theme + extension selection)                       | ⬜ Pending      |
| 13    | Templates + asset management (built-in templates, custom templates, image upload/versions)        | ⬜ Pending      |
| 14    | SAML authentication (passport-saml, Entra ID SSO, user provisioning)                              | ⬜ Pending      |
| 15    | Enterprise security (MFA/TOTP, IP restrictions, audit log, performance hardening)                 | ⬜ Pending      |
