---

description: "Task list for Collaboration Server (Phase 8)"
---

# Tasks: Collaboration Server

**Input**: Design documents from `specs/018-collaboration-server/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)

## Path Conventions

Test files live under a dedicated `tests/` directory at the package or app root, mirroring the source tree.

| Package / App             | Source root                    | Test root                        |
|---------------------------|--------------------------------|----------------------------------|
| `packages/domain`         | `packages/domain/src/`         | `packages/domain/tests/`         |
| `packages/infrastructure` | `packages/infrastructure/src/` | `packages/infrastructure/tests/` |
| `apps/api`                | `apps/api/src/`                | `apps/api/tests/`                |
| `apps/collab`             | `apps/collab/src/`             | `apps/collab/tests/`             |

### Domain-package subfolder conventions

| Layer           | Source paths                                                                       | Test paths                                               |
|-----------------|------------------------------------------------------------------------------------|----------------------------------------------------------|
| Use cases       | `packages/domain/src/use-cases/{auth,project,file-tree,content,settings,members}/` | `packages/domain/tests/use-cases/{subfolder}/`           |
| Port interfaces | `packages/domain/src/ports/{user,project,file-tree,storage,auth-tokens,admin}/`    | `packages/domain/tests/ports/{subfolder}/`               |
| Infrastructure  | `packages/infrastructure/src/persistence/{user,project,file-tree,storage,...}/`    | `packages/infrastructure/tests/persistence/{subfolder}/` |

---

## Phase 1: Setup

**Purpose**: Scaffold the new `apps/collab` package and wire it into the workspace.

- [X] T001 Create `apps/collab/package.json` with name `@asciidocollab/collab`, type `commonjs`, scripts: `"build": "tsc"`, `"test": "jest"`, `"typecheck": "tsc --noEmit"`, `"lint": "eslint ."`, `"start": "node dist/index.js"`, and dependencies: `@hocuspocus/server`, `yjs`, `pino`, `convict`, `@asciidocollab/domain`, `@asciidocollab/infrastructure`, `@asciidocollab/db`, `@asciidocollab/shared`
- [X] T002 Create `apps/collab/tsconfig.json` extending the workspace root tsconfig with `outDir: dist`, `rootDir: src`, and `include: ["src/**/*", "tests/**/*"]`
- [X] T003 [P] Implement convict config schema in `apps/collab/src/config/collab-config.ts` — fields: `ASCIIDOCOLLAB_COLLAB_PORT` (default: `4002`); `ASCIIDOCOLLAB_COLLAB_API_INTERNAL_URL` (default: `http://127.0.0.1:4001` — import `COLLAB_INTERNAL_PORT_DEFAULT` from `@asciidocollab/shared` and use it to build this default string; this is the single URL used by the auth hook to reach `apps/api`'s internal server — do NOT add a separate `ASCIIDOCOLLAB_COLLAB_INTERNAL_PORT` field to the collab config, that field belongs only in `apps/api`); `ASCIIDOCOLLAB_COLLAB_AUTH_TIMEOUT_MS` (default: `3000`); `ASCIIDOCOLLAB_COLLAB_WATCHDOG_INTERVAL_MS` (default: `30000`); `ASCIIDOCOLLAB_STORAGE_PATH` (reuses the same env var as `apps/api` — both apps must point to the same storage directory); `ASCIIDOCOLLAB_DATABASE_URL`
- [X] T004 [P] Update `apps/api/src/config/schema.ts` — add a new top-level `collab` section to the convict schema with one field: `internalPort` mapped to `ASCIIDOCOLLAB_COLLAB_INTERNAL_PORT` (import `COLLAB_INTERNAL_PORT_DEFAULT` from `@asciidocollab/shared` and use as default); ALSO add the matching `collab: { internalPort: number }` block to the `Config` TypeScript interface at the bottom of the same file (the interface must stay in sync with the convict schema or TypeScript will report an error)
- [X] T005 [P] Delete stub `apps/api/src/plugins/hocuspocus-persistence.ts` (replaced by `apps/collab/src/extensions/persistence.ts`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: DB schema, shared contracts, domain ports and errors, in-memory fakes, new use cases, and infrastructure adapters that every user story phase depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

**TDD note**: Integration tests (T015) and use-case tests (T013) are written first and confirmed failing before their implementation tasks (T016, T014).

- [X] T006 Add `CollaborationSession` Prisma model to `packages/db/prisma/schema.prisma` with the following exact shape: `id` (UUID PK, `@default(uuid()) @db.Uuid`), `projectId` (UUID, FK → `Project.id` with `onDelete: Cascade`), `documentId` (UUID, FK → `Document.id` with `onDelete: Cascade`), `createdAt` (`DateTime @default(now())`); `@@unique([projectId, documentId])`; `@@index([projectId])`; `@@index([documentId])`; `@@map("collaboration_sessions")`. Also add `collaborationSessions CollaborationSession[]` back-relations to both the existing `Project` model and the existing `Document` model. **Pause and ask the user before running `prisma migrate`.**
- [X] T007 [P] Define `CollaborationSessionRepository` port interface in `packages/domain/src/ports/project/collaboration-session.repository.ts` with methods: `isActive(projectId, documentId): Promise<boolean>`, `open(projectId, documentId): Promise<void>`, `close(projectId, documentId): Promise<void>`, `closeAllForProject(projectId): Promise<void>`, `closeAll(): Promise<void>`
- [X] T008 [P] Define `ActiveCollaborationSessionError extends DomainError` in `packages/domain/src/errors/active-collaboration-session.ts` accepting `documentId` in constructor; export from the domain barrel
- [X] T009 [P] Add `findByYjsStateId(yjsStateId: YjsStateId): Promise<Document | null>` to the `DocumentRepository` port interface in `packages/domain/src/ports/file-tree/document.repository.ts` — `YjsStateId` already exists at `packages/domain/src/value-objects/yjs-state-id.ts`; import from there
- [X] T010 [P] Create `packages/shared/src/dtos/collab.dto.ts` — export `CollabAuthRole = 'editor' | 'observer'`, `CollabAuthResponse = { role: CollabAuthRole }`, and `COLLAB_INTERNAL_PORT_DEFAULT = 4001`; re-export all three from `packages/shared/src/dtos/index.ts` and from `packages/shared/src/index.ts`
- [X] T011 [P] Implement `InMemoryCollaborationSessionRepository` in `packages/domain/tests/ports/project/in-memory-collaboration-session-repository.ts` — uses `Set<string>` keyed by `${projectId.value}:${documentId.value}`; never throws; export for reuse in use-case tests
- [X] T012 [P] Extend the existing `InMemoryDocumentRepository` in `packages/domain/tests/` with a `findByYjsStateId` implementation that searches the in-memory store by `document.yjsStateId.value`
- [X] T013 Write failing unit tests for `OpenCollaborationSessionUseCase` and `CloseCollaborationSessionUseCase` in `packages/domain/tests/use-cases/project/collaboration-session-lifecycle.test.ts` — use `InMemoryCollaborationSessionRepository`; test: (a) `open` records session and `isActive` returns true, (b) `close` removes record and `isActive` returns false, (c) both return `Result.ok(void)` on success, (d) errors from the repository are propagated as `Result.error`. **Confirm all tests fail (RED) before T014.**
- [X] T014 Implement `OpenCollaborationSessionUseCase` in `packages/domain/src/use-cases/project/open-collaboration-session.ts` and `CloseCollaborationSessionUseCase` in `packages/domain/src/use-cases/project/close-collaboration-session.ts` — each accepts `(projectId: ProjectId, documentId: DocumentId, collaborationSessionRepo: CollaborationSessionRepository)` and calls `repo.open()`/`repo.close()` returning `Result<void, DomainError>`; export from the domain barrel. Make T013 pass (GREEN).
- [X] T015 Write integration test for `PrismaCollaborationSessionRepository` using testcontainers in `packages/infrastructure/tests/persistence/project/prisma-collaboration-session-repository.test.ts` — cover `open` idempotency, `close` no-op, `isActive` true/false, `closeAll` clears all records. **Confirm all tests fail (RED) before T016.**
- [X] T016 Implement `PrismaCollaborationSessionRepository` in `packages/infrastructure/src/persistence/project/prisma-collaboration-session-repository.ts` — `open` uses Prisma `upsert` on `(projectId, documentId)`; `close`/`closeAllForProject`/`closeAll` use `deleteMany`; `isActive` uses `findFirst`. Make T015 pass (GREEN).
- [X] T017 [P] Extend `PrismaDocumentRepository` in `packages/infrastructure/src/persistence/file-tree/prisma-document.repository.ts` with `findByYjsStateId` — Prisma query by `yjsStateId` field; return `null` if not found; write test first in `packages/infrastructure/tests/persistence/file-tree/` (confirm fail, then implement)

**Checkpoint**: Domain ports, fakes, use cases, and infrastructure adapters are ready — user story phases can now begin.

---

## Phase 3: User Story 1 — Real-Time Co-Editing (Priority: P1) 🎯 MVP

**Goal**: Two or more authenticated project members open the same file and see each other's changes appear in real time without any manual refresh.

**Independent Test**: Two browser sessions open the same project file. User A types text; User B sees it appear within 1 second. User B deletes a word; User A sees the deletion. Both users can type simultaneously without one overwriting the other.

**TDD note**: T018 and T020 are written first and confirmed failing before T019 and T021.

- [X] T018 [US1] Write failing tests for `PersistenceExtension` in `apps/collab/tests/extensions/persistence.test.ts` — define test cases for: (a) `onLoadDocument` loads Yjs binary state when store has existing state, (b) `onLoadDocument` bootstraps from file content when no Yjs state exists and immediately persists result, (c) `onStoreDocument` writes encoded `getText('codemirror')` to both `YjsStateStore` and `ProjectFileStore`, (d) awareness update from client A is relayed to client B in the same room. Mock `YjsStateStore` and `ProjectFileStore`. **Confirm all tests fail (RED) before T019.**
- [X] T019 [US1] Implement `apps/collab/src/extensions/persistence.ts` — `onLoadDocument`: load Yjs binary state from `FilesystemYjsStateStore`; if no state exists bootstrap from `ProjectFileStore` content via `doc.getText('codemirror')` and immediately persist the resulting state; `onStoreDocument`: encode `doc.getText('codemirror').toString()` and write back to both `YjsStateStore` and `ProjectFileStore`. Do NOT add observer write-rejection here — that belongs in Phase 5 once the auth-hook sets the role. Make T018 pass (GREEN).
- [X] T020 [P] [US1] Write smoke test for `createCollabServer` factory in `apps/collab/tests/server.test.ts` — verify server initialises with the persistence extension registered and `maxDebounce` reflects the configured write-back interval. **Confirm it fails (RED) before T021.**
- [X] T021 [US1] Implement `apps/collab/src/server.ts` — Hocuspocus `Server` factory that accepts an extensions array and config; reads `collaboration.writeback_interval_seconds` from `SystemSettingRepository` to set `debounce` and `maxDebounce`; registers awareness broadcast. Export `createCollabServer(config, extensions)`. Make T020 pass (GREEN).
- [X] T022 [US1] Implement `apps/collab/src/composition-root.ts` — DI wiring: create `PrismaClient`; instantiate `PrismaCollaborationSessionRepository`, `FilesystemYjsStateStore`, `FilesystemProjectFileStore`, `SystemSettingRepository`, `PrismaDocumentRepository`; wire into `PersistenceExtension`; instantiate `OpenCollaborationSessionUseCase` and `CloseCollaborationSessionUseCase`; call `createCollabServer`; export `{ server, prisma, collaborationSessionRepo, documentRepository }`
- [X] T023 [US1] Write failing test for graceful-shutdown handler in `apps/collab/tests/index.test.ts` — simulate SIGTERM; verify the ordered shutdown sequence fires: `server.destroy()` → `collaborationSessionRepo.closeAll()` → `prisma.$disconnect()`; verify `onStoreDocument` is called for all active rooms before the process exits. **Confirm it fails (RED) before T024.**
- [X] T024 [US1] Implement `apps/collab/src/index.ts` — create Pino logger with `redact: ['req.headers.cookie', 'req.headers.Cookie']`; call `compositionRoot()`; call `collaborationSessionRepo.closeAll()` before `server.listen()` (startup crash-recovery); register SIGTERM/SIGINT handlers with ordered graceful shutdown: `await server.destroy()` → `await collaborationSessionRepo.closeAll()` → `await prisma.$disconnect()`; exit code 1 on unhandled shutdown error. Make T023 pass (GREEN).

**Checkpoint**: `apps/collab` process starts, connects to a room, syncs documents between two clients. US1 is independently testable.

---

## Phase 4: User Story 2 — Joining an Active Collaboration Session (Priority: P1)

**Goal**: A project member who opens a file that others are already editing immediately receives the complete current document state, including all edits made while they were absent.

**Independent Test**: User A edits a file for 30 seconds. User B then opens the same file. User B's editor shows all of User A's changes without any manual sync action.

**TDD note**: T027 (watchdog test) is written first and confirmed failing before T028 (watchdog implementation).

- [X] T025 [US2] Add `onConnect` hook to `apps/collab/src/server.ts` — parse `projectId` and `yjsStateId` from the room name `<projectId>/<yjsStateId>`; delegate to `openCollaborationSessionUseCase.execute(projectId, documentId)` when the first client joins a room (detect first join via `context.document.connections.size === 1` or equivalent Hocuspocus API); log and close the connection if the use case returns an error
- [X] T026 [US2] Add `onDisconnect` hook to `apps/collab/src/server.ts` — delegate to `closeCollaborationSessionUseCase.execute(projectId, documentId)` only when the last client leaves the room (check `context.document.connections.size === 0` or equivalent Hocuspocus API after the disconnect)
- [X] T027 [US2] Write failing test for the orphaned-room watchdog in `apps/collab/tests/watchdog.test.ts` — verify that when an in-memory room's document no longer exists in `DocumentRepository` (simulating project/document deletion with DB cascade), the watchdog detects it within one interval and destroys the room. **Confirm it fails (RED) before T028.**
- [X] T028 [US2] Implement `apps/collab/src/watchdog.ts` — export `startOrphanedRoomWatchdog(server, documentRepository, intervalMs)` that runs a `setInterval` loop: for each active room in `server.documents`, parses `yjsStateId` from the `documentName`, calls `documentRepository.findByYjsStateId(yjsStateId)`, and if `null` is returned (document/project deleted via DB cascade) calls `document.destroy()` to disconnect all clients. Call `startOrphanedRoomWatchdog` from `apps/collab/src/index.ts` after server start, passing the `ASCIIDOCOLLAB_COLLAB_WATCHDOG_INTERVAL_MS` config value (from the schema defined in T003); clear the interval during graceful shutdown. Make T027 pass (GREEN).

**Checkpoint**: `CollaborationSession` records are created/deleted correctly; a late-joining user sees the full Yjs document state; orphaned rooms from deleted projects are cleaned up automatically.

---

## Phase 5: User Story 3 — Access Control for Collaboration Rooms (Priority: P1)

**Goal**: Only authenticated members of a project can join that project's document rooms. Unauthenticated users and non-members are rejected before any document data is exchanged. Viewers connect as read-only observers.

**Independent Test**: Cross-project user connection is refused. Unauthenticated request is refused. Valid project member connects successfully. Viewer connects but their edit attempt is rejected by the server.

**TDD note**: T029 (route test) is written before T031 (route impl); T033 (auth-hook test) is written before T034 (auth-hook impl). Confirm each fails before implementing.

- [X] T029 [US3] Write failing tests for `GET /internal/collab/auth` route in `apps/api/tests/routes/internal/collab-auth.test.ts` — define cases: (a) valid member → 200 `CollabAuthResponse { role: 'editor' }`, (b) valid viewer → 200 `CollabAuthResponse { role: 'observer' }`, (c) unauthenticated → 401, (d) non-member → 403, (e) malformed `documentName` → 400, (f) unknown `yjsStateId` → 403. **Confirm all tests fail (RED) before T030–T031.**
- [X] T030 [US3] Create `apps/api/src/internal-server.ts` — second Fastify instance bound to `127.0.0.1:ASCIIDOCOLLAB_COLLAB_INTERNAL_PORT`; registers only: session plugin (for cookie validation) and the `collab-auth` route; does NOT register CSRF, origin-check, or rate-limit plugins; export `createInternalServer(fastify, config)`
- [X] T031 [US3] Implement `GET /internal/collab/auth` route in `apps/api/src/routes/internal/collab-auth.ts` — import `CollabAuthResponse` from `@asciidocollab/shared`; Fastify schema validates `documentName` against UUID v4 pattern for both halves (returns 400 if invalid); resolves `projectId` + `yjsStateId` from `documentName`; looks up `Document` via `DocumentRepository.findByYjsStateId`; checks `ProjectMemberRepository`; returns `200 CollabAuthResponse`, `401 { error: 'Unauthorized' }`, or `403 { error: 'Not a member of this project' }`. Make T029 pass (GREEN).
- [X] T032 [P] [US3] Wire internal server lifecycle into `apps/api` bootstrap — start internal server after main server is ready; close it gracefully on shutdown (find the existing `apps/api` startup file, e.g. `apps/api/src/app.ts` or `apps/api/src/index.ts`)
- [X] T033 [US3] Write failing tests for `AuthHookExtension` in `apps/collab/tests/extensions/auth-hook.test.ts` — mock the internal HTTP client; define cases: (a) 200 with `CollabAuthRole 'editor'` → role stored on `connection.context.role`, connection accepted; (b) 200 with `'observer'` → role stored, connection accepted; (c) 401 → `connection.destroy()` called with close code 1008; (d) 403 → same; (e) timeout → `connection.destroy()` with 1008 and `warn` logged with room name (no cookie in log); (f) network error → same as timeout. **Confirm all tests fail (RED) before T034.**
- [X] T034 [US3] Implement `apps/collab/src/extensions/auth-hook.ts` — import `CollabAuthResponse` from `@asciidocollab/shared`; `onConnect` hook: forward WebSocket handshake `Cookie` header to `GET /internal/collab/auth?documentName=<room>`; wrap HTTP call with `AbortSignal.timeout(AUTH_TIMEOUT_MS)`; on 200: parse `role` from `CollabAuthResponse` and store on `connection.context.role`; on 401/403: call `connection.destroy()` with close code 1008; on timeout or network error: call `connection.destroy()` with close code 1008 and log `warn` with room name and error class (never log the cookie value). Make T033 pass (GREEN).
- [X] T035 [US3] Register `AuthHookExtension` in `apps/collab/src/server.ts` — pass it as the first extension in the array so auth runs before persistence; thread the HTTP base URL and auth timeout through `composition-root.ts`
- [X] T036 [US3] Add observer write-rejection to `apps/collab/src/extensions/persistence.ts` — in `onStoreDocument`, check `connection.context.role === 'observer'`; if so, call `connection.destroy(1008)` and return without writing. Add a corresponding test case to `apps/collab/tests/extensions/persistence.test.ts` (write failing assertion first, then implement).

**Checkpoint**: Unauthenticated and non-member connections are rejected 100% of the time before any document content is transmitted. Observers can connect but cannot write.

---

## Phase 6: User Story 4 — Persistent Collaborative State Across Sessions (Priority: P2)

**Goal**: When all users close a document and the active session ends, the Yjs state is persisted. The next user who opens the file loads the full collaborative history. Active-room upload/delete blocking prevents data loss.

**Independent Test**: Users A and B collaborate on a file, then both close it. After some time, User A reopens the file alone and sees all edits from the previous session. An upload attempted while the room is active is rejected with HTTP 409.

**TDD note**: T037 and T039 (test tasks) are written first and confirmed failing before T038 and T040 (refactor tasks).

- [X] T037 [P] [US4] Write failing unit tests for the active-session guard in `packages/domain/tests/use-cases/content/save-document-content.test.ts` — use `InMemoryCollaborationSessionRepository`; define cases: (a) active session → `ActiveCollaborationSessionError` returned without writing, (b) no active session → write proceeds normally, (c) no `collaborationSessionRepo` provided → write always proceeds (backwards-compatible). **Confirm all tests fail (RED) before T038.**
- [X] T038 [P] [US4] Refactor `SaveDocumentContentUseCase` in `packages/domain/src/use-cases/content/save-document-content.ts` — add optional `collaborationSessionRepo?: CollaborationSessionRepository` constructor dependency; after membership check and before write, if repo is provided and `isActive(projectId, documentId)` returns true, return `Result.error(new ActiveCollaborationSessionError(documentId))`. Make T037 pass (GREEN).
- [X] T039 [P] [US4] Write failing unit tests for the active-session guard in `packages/domain/tests/use-cases/file-tree/delete-file.test.ts` — use `InMemoryCollaborationSessionRepository`; define cases: (a) single file with active session → `ActiveCollaborationSessionError`, (b) folder with one active descendant file → error, (c) no active sessions → deletion proceeds, (d) no repo provided → deletion proceeds. **Confirm all tests fail (RED) before T040.**
- [X] T040 [P] [US4] Refactor `DeleteFileUseCase` in `packages/domain/src/use-cases/file-tree/delete-file.ts` — add optional `collaborationSessionRepo?: CollaborationSessionRepository` dependency; for `file` nodes: check `isActive` on the document; for `folder` nodes: check each descendant file's document; return `ActiveCollaborationSessionError` if any are active. Make T039 pass (GREEN).
- [X] T041 [US4] Update `apps/api` composition root to inject `PrismaCollaborationSessionRepository` into `SaveDocumentContentUseCase` and `DeleteFileUseCase` (find the existing wiring location in `apps/api/src/`) — without this step the active-session guard in T038/T040 will never run in production because the optional parameter would remain `undefined`
- [X] T042 [US4] Update `apps/api` upload and delete route handlers to translate `ActiveCollaborationSessionError` → HTTP 409 with body `{ error: 'This file is currently being edited by active collaborators. Please try again later.' }` (find the existing save-document-content route and delete-file route in `apps/api/src/routes/`)

**Checkpoint**: Yjs state survives server restarts. Upload/delete to actively-edited files returns 409. State is bootstrapped from file content on first open.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Workspace integration, CI pipeline coverage, type safety, load validation, environment documentation, and developer experience.

- [X] T043 [P] Verify `apps/collab` is covered by the `apps/*` glob already in `pnpm-workspace.yaml` — no manual entry is needed; confirm by running `pnpm ls --filter @asciidocollab/collab` after T001 is complete
- [X] T044 [P] Register `apps/collab` in `onion.config.json` (fresh-onion architecture guard, run as `npx fresh-onion` in the CI quality job) — add `"collab": "./apps/collab/src"` to the `layers` block, and add `{ "from": "collab", "allowedImports": ["domain", "infrastructure", "shared"] }` to the `rules` array; without this entry, fresh-onion silently skips all import-layer analysis for `apps/collab`
- [X] T045 [P] Add a `# ─── Collaboration server ───` section to `.env.example` with the following entries and comments: `ASCIIDOCOLLAB_COLLAB_PORT=4002` (WebSocket port for apps/collab), `ASCIIDOCOLLAB_COLLAB_INTERNAL_PORT=4001` (loopback port apps/api binds its internal auth server to), `ASCIIDOCOLLAB_COLLAB_API_INTERNAL_URL=http://127.0.0.1:4001` (URL apps/collab uses to reach apps/api's internal auth endpoint), `ASCIIDOCOLLAB_COLLAB_AUTH_TIMEOUT_MS=3000` (auth hook timeout), `ASCIIDOCOLLAB_COLLAB_WATCHDOG_INTERVAL_MS=30000` (orphaned-room cleanup interval); note that `ASCIIDOCOLLAB_STORAGE_PATH` and `ASCIIDOCOLLAB_DATABASE_URL` are already in `.env.example` and are reused by `apps/collab` without a new entry; add a comment near the `Start API server` step in `.github/workflows/ci.yml` noting that `ASCIIDOCOLLAB_COLLAB_PORT` and `ASCIIDOCOLLAB_COLLAB_INTERNAL_PORT` must be added to the e2e job when Phase 9 adds collaboration E2E tests
- [X] T046 [P] Add JSDoc `@param` / `@returns` / `@throws` comments to all public exports in new domain and infrastructure files (ports, errors, use cases, repository implementations)
- [ ] T047 Add a load-test baseline for SC-006 in `apps/collab/tests/load/concurrent-rooms.test.ts` — spin up 50 in-process Hocuspocus rooms; connect two clients to each; assert that a document update sent by client A in each room is relayed to client B within the 1-second threshold (SC-001)
- [X] T048 Verify full build and quality gates for `apps/collab`: run `pnpm --filter @asciidocollab/collab build`, `pnpm --filter @asciidocollab/collab lint`, and `pnpm --filter @asciidocollab/collab typecheck`; confirm zero TypeScript errors, zero lint warnings
- [X] T049 Run full monorepo test suite (`pnpm test`) and confirm zero regressions in existing tests
- [X] T050 [P] Add `apps/collab` type-check step to the CI quality job in `.github/workflows/ci.yml` — insert `- name: Type-check — collab` with `run: npx tsc -p apps/collab/tsconfig.json --noEmit` directly after the existing `Type-check — API` step
- [X] T051 [P] Add `apps/collab` unit test step to the CI unit job in `.github/workflows/ci.yml` — insert `- name: Collab unit tests` with `run: pnpm --filter @asciidocollab/collab test` directly after the existing `API unit tests` step
- [X] T052 [P] Update `scripts/dev.sh` to start the collab server — declare `COLLAB_PID=""` alongside `API_PID` and `WEB_PID`; after starting the API server add `(cd "$ROOT/apps/collab" && NODE_ENV=development node dist/index.js) &` and assign `COLLAB_PID=$!`; add `[[ -n "$COLLAB_PID" ]] && kill "$COLLAB_PID" 2>/dev/null || true` to the `cleanup()` function; add a `Collab   →  ${CYAN}ws://localhost:${ASCIIDOCOLLAB_COLLAB_PORT:-4002}${RESET}` line to the welcome banner
- [ ] T053 Write Playwright E2E spec in `apps/web/e2e/collab-access.spec.ts` — use the existing `ensureTestUser`/`createProject`/`signIn` helpers; cover: (a) **SC-004 unauth rejection** — `page.evaluate` opens `new WebSocket('ws://localhost:4002/<projectId>/<yjsStateId>')` with no session cookie → `close` event fires with code 1008; (b) **SC-004 non-member** — authenticated user from a second account who is not a project member → rejected with code 1008; (c) **auth acceptance** — authenticated project owner → `open` event fires and connection stays open; (d) **FR-011 upload blocking** — while a member's raw WebSocket room is active for a document, a file upload request to that document returns HTTP 409 with body containing `"currently being edited"`. Requires `apps/collab` running (see T054).
- [ ] T054 Update the CI e2e job in `.github/workflows/ci.yml` to start `apps/collab` — add a `Start collab server` step immediately after the existing `Start API server` step, running `nohup pnpm --filter @asciidocollab/collab start &` with env: `NODE_ENV: test`, `ASCIIDOCOLLAB_DATABASE_URL: postgresql://asciidocollab:asciidocollab@localhost:5432/asciidocollab`, `ASCIIDOCOLLAB_COLLAB_PORT: 4002`, `ASCIIDOCOLLAB_COLLAB_API_INTERNAL_URL: http://127.0.0.1:4001`, `ASCIIDOCOLLAB_COLLAB_AUTH_TIMEOUT_MS: 3000`; add a `Wait for collab server` step: `until nc -z localhost 4002; do sleep 1; done`; remove the "deferred to Phase 9" CI comment added in T045

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately; T003, T004, T005 can run in parallel
- **Foundational (Phase 2)**: Depends on Phase 1 completion — blocks all user story phases; T007–T012, T017 can run in parallel after T006; T013 and T015 require the fakes (T011/T012) to be done first
- **User Story Phases (3–6)**: All depend on Phase 2 completion
  - Phase 3 (US1), Phase 4 (US2), Phase 5 (US3): all P1 — implement sequentially (US3 provides auth for US1)
  - Phase 6 (US4): P2 — can start after Phase 2 completes in parallel with Phases 3–5
- **Polish (Phase 7)**: Depends on all desired phases being complete; T043–T046, T050–T052 can all run in parallel; T053 requires Phase 5 complete (auth endpoint must exist); T054 requires T053; T047 requires US1 complete; T048 requires T001; T049 requires all other tasks

### User Story Dependencies

- **US1 (P1)**: Requires Phase 2 complete. Observer write-rejection omitted from this phase; added in US3 (T036) once the auth-hook provides the role.
- **US2 (P1)**: Requires US1 (`server.ts` exists for hook wiring). T025/T026 delegate to use cases from T014.
- **US3 (P1)**: Requires Phase 2 complete and US1 (`server.ts` and `persistence.ts` exist). Auth-hook and observer guard both added here.
- **US4 (P2)**: Requires Phase 2 complete. T038/T040 refactors are independent of US1–US3. T041 (api wiring) depends on T038 and T040.

### Within Each User Story (TDD cycle)

1. Write test(s) and confirm they **fail** (RED)
2. Write the minimal implementation to make them pass (GREEN)
3. Refactor while keeping tests green

### Parallel Opportunities

**Phase 2 (after T006 schema)**:
```
Parallel group A (all independent):
  T007  CollaborationSessionRepository port (project/ subfolder)
  T008  ActiveCollaborationSessionError
  T009  findByYjsStateId on DocumentRepository port
  T010  packages/shared collab DTO + constant
  T011  InMemoryCollaborationSessionRepository fake (project/ subfolder)
  T012  Extend InMemoryDocumentRepository
  T017  PrismaDocumentRepository.findByYjsStateId (with inline test)

Sequential after group A:
  T013  Use-case tests for OpenCollaborationSession + CloseCollaborationSession (RED)
  T014  Use-case implementations (GREEN)
  T015  PrismaCollaborationSessionRepository integration test (RED)
  T016  PrismaCollaborationSessionRepository implementation (GREEN)
```

**Phase 4 (US2 Session Lifecycle)**:
```
T025  onConnect hook (delegate to OpenCollaborationSessionUseCase)
T026  onDisconnect hook (delegate to CloseCollaborationSessionUseCase)
T027  Orphaned-room watchdog test (RED)
T028  Orphaned-room watchdog implementation (GREEN)
```

**Phase 5 (US3 Access Control)**:
```
Parallel:
  T029  collab-auth route tests (RED)
  T033  auth-hook tests (RED)

Sequential after each test:
  T030  internal-server.ts (scaffold)
  T031  collab-auth route impl, imports CollabAuthResponse from shared (GREEN for T029)
  T032 [P]  wire internal server lifecycle
  T034  auth-hook impl, imports CollabAuthResponse from shared (GREEN for T033)
  T035  register AuthHookExtension in server.ts
  T036  observer write-rejection in persistence.ts
```

**Phase 6 (US4 Persistence)**:
```
Parallel:
  T037  SaveDocumentContentUseCase tests (RED)
  T039  DeleteFileUseCase tests (RED)

After each test:
  T038  Refactor SaveDocumentContentUseCase (GREEN)
  T040  Refactor DeleteFileUseCase (GREEN)

Sequential after T038 + T040:
  T041  apps/api composition root wiring
  T042  apps/api route handlers for 409
```

---

## Implementation Strategy

### MVP First (User Stories 1–3)

1. Complete Phase 1: Setup (T001–T005)
2. Complete Phase 2: Foundational (T006–T017) — **blocks everything**
3. Complete Phase 3: US1 — Real-Time Co-Editing (T018–T024)
4. Complete Phase 4: US2 — Session Joining + Orphaned-Room Cleanup (T025–T028)
5. Complete Phase 5: US3 — Access Control (T029–T036)
6. **STOP and VALIDATE**: two users can co-edit securely; late joiners get full state; auth gate works; orphaned rooms close on project deletion
7. Deploy/demo MVP

### Incremental Delivery

1. Setup + Foundational → shared types, use cases, infrastructure ready
2. US1 → smoke-test local collab without auth (dev only)
3. US2 → verify late-join sync + orphaned-room watchdog
4. US3 → auth gate live; production-ready collaboration
5. US4 → persistence hardened; upload blocking enforced
6. Polish → full build + regression; SC-006 load baseline; deploy

---

## Notes

- **TDD is NON-NEGOTIABLE** (Constitution Principle II): every test task MUST be written and confirmed failing before the implementation task it covers begins
- `[P]` tasks touch different files with no cross-task data dependency — safe to run concurrently
- T006 schema change: **ask user before running `prisma migrate dev`** (Architecture Constitution migration policy)
- Yjs CJS workaround: `yjs` must be loaded via `createRequire` in `apps/collab` — no `as` casts (Architecture Constitution P0 rule 6)
- Room name format `<projectId>/<yjsStateId>` is the canonical identifier across auth hook, persistence extension, and session repository (see `contracts/hocuspocus-room-naming.md`)
- `CollabAuthResponse` and `COLLAB_INTERNAL_PORT_DEFAULT` are defined once in `packages/shared/src/dtos/collab.dto.ts` and imported by both `apps/api` and `apps/collab` — never duplicated (Architecture Constitution §Contracts)
- `CollaborationSessionRepository` port is in `packages/domain/src/ports/project/` (not `storage/`) — session tracking is a project-scoped operational concern, not file/blob storage
- `OpenCollaborationSessionUseCase` and `CloseCollaborationSessionUseCase` in `packages/domain/src/use-cases/project/` ensure `onConnect`/`onDisconnect` hooks delegate to the use-case layer per Architecture Constitution §Business Logic Placement
- Observer write-rejection is in Phase 5 (US3), not Phase 3 (US1): `persistence.ts` reads `connection.context.role`, which is only set after T034 (auth-hook) is wired
- `closeAll()` on startup (T024) clears stale `CollaborationSession` records from unclean shutdowns — safe only for single-instance deployments (see research Decision 2)
- FR-012 (editor read-only when collab server unreachable) is deferred to Phase 9; see `spec.md` for the explicit deferral note

---

## Deferred E2E Tests (Phase 9 — Editor Integration)

The following Playwright E2E tests require the CodeMirror-Yjs provider binding and awareness UI components that will be built in Phase 9. They are listed here so they are not forgotten when Phase 9 is scoped.

| Future file | Requirements covered | Scenario |
|-------------|---------------------|----------|
| `apps/web/e2e/collab-editing.spec.ts` | FR-001, FR-005, FR-007, SC-001, SC-005 | Two users open the same file; User A types; User B sees the change within 1 second. Concurrent edits by both users converge to identical text. |
| `apps/web/e2e/collab-awareness.spec.ts` | FR-010 | User B sees User A's cursor position, text selection, display name, and avatar in the editor overlay. User A does NOT see their own cursor/avatar rendered. |
| `apps/web/e2e/collab-observer.spec.ts` | FR-004 (observer), US3 AC5 | A project viewer (observer role) connects to the room; their editor is read-only; any edit attempt is rejected by the server. |
| `apps/web/e2e/collab-late-join.spec.ts` | FR-007, FR-008, SC-002 | User A edits for 30 seconds; User B then opens the same file; User B's editor shows all of User A's changes without manual sync within 2 seconds. |

**These test files MUST be created as part of Phase 9 before Phase 9 is marked complete.**
