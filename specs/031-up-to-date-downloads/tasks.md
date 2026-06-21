---

description: "Task list for Up-to-Date Downloads (031)"
---

# Tasks: Up-to-Date Downloads

**Input**: Design documents from `/specs/031-up-to-date-downloads/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/downloads.md, quickstart.md

**Tests**: REQUIRED. Constitution Principle II (TDD, NON-NEGOTIABLE) mandates a failing test before production code. Every implementation task is preceded by its test task. Performance/load tests are OUT (opt-in; spec does not request them).

**Organization**: Tasks are grouped by user story. US1 (single-file) and US2 (project ZIP) are both P1; US3 (resilience) is P2 and largely exercises the shared resolver built in Foundational.

## Path Conventions

Tests live under each package/app `tests/` tree, mirroring `src/` (drop `src/`). No `__tests__/`, no co-location. Domain use cases: `packages/domain/src/use-cases/project/` ↔ `packages/domain/tests/use-cases/project/`. API routes: `apps/api/src/routes/projects/` ↔ `apps/api/tests/routes/projects/`.

## Reuse note (Constitution Principle IV)

No new port, adapter, endpoint, or schema. This feature wires the existing feature-027 live-read stack into the download path:

- Port `CollaborativeContentReader` (`packages/domain/src/ports/storage/collaborative-content-reader.ts`)
- Repos `DocumentRepository` (`findByFileNodeId`), `CollaborationSessionRepository` (`isActive`)
- Pattern reference: `GetFileNodeContentUseCase` / `resolveFileContent` (`packages/domain/src/use-cases/content/`)
- DI already wired in `apps/api/src/di/{repositories,stores}.ts`: `repos.document`, `repos.collaborationSession`, `stores.collaborativeContentEditor`
- In-memory fakes already exist: `CollaborativeContentReader`, `DocumentRepository`, `in-memory-collaboration-session-repository.ts`, `ProjectFileStore`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the reusable building blocks exist; no new dependencies are added.

- [X] T001 Confirm the DI wiring to reuse: `repos.document`, `repos.collaborationSession`, and `stores.collaborativeContentEditor` are available on the Fastify instance in `apps/api/src/di/repositories.ts` and `apps/api/src/di/stores.ts`, and identify the existing `Logger` port adapter used by content routes (the same one `GetFileNodeContentUseCase` receives) to reuse in the download routes. No code change.

**Checkpoint**: Reusable ports/adapters/fakes located — implementation can proceed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared, session-gated content-source resolver that BOTH download use cases consume. This encapsulates the live-read + disk-fallback decision (and therefore the US3 resilience behavior).

**⚠️ CRITICAL**: US1, US2, and US3 all depend on this phase.

- [X] T002 Write FAILING unit tests for the shared resolver in `packages/domain/tests/use-cases/project/download-content-source.test.ts`, covering: (a) document + active session + reader returns text ⇒ `{ kind: 'inline', bytes }` equal to the live text; (b) document + active session + reader returns `null` ⇒ `{ kind: 'stored' }`, no warning; (c) document + active session + reader returns `Result.error` ⇒ `{ kind: 'stored' }` and a `warn` is logged whose payload is METADATA ONLY (`projectId`/`fileNodeId`/`path` + error message) — it MUST NOT contain document bytes or the internal-edit secret (Security Constitution: redact sensitive data; no internal leak); (d) document but session NOT active ⇒ `{ kind: 'stored' }`, reader NOT called; (e) no document (binary asset) ⇒ `{ kind: 'stored' }`, reader NOT called; (f) snapshot fidelity (FR-003/SC-005): for case (a), the `inline` bytes equal the reader's returned string byte-for-byte (UTF-8) — the resolver returns the live value verbatim and performs NO re-assembly/concatenation, so a torn/partial document is structurally impossible. Use existing in-memory fakes for `DocumentRepository`, `CollaborationSessionRepository`, `CollaborativeContentReader`, and a spy logger.
- [X] T003 Implement the resolver in `packages/domain/src/use-cases/project/download-content-source.ts`: export the `DownloadContentSource` discriminated union (`{ kind: 'inline'; bytes: Buffer } | { kind: 'stored' }`) and `resolveDownloadContentSource(deps, projectId, fileNode)` following the resolution rule in `data-model.md` (findByFileNodeId → isActive gate → readContent → inline | warn+stored | stored). The `inline` case MUST wrap the reader's value verbatim (`Buffer.from(value, 'utf8')`) with no re-assembly — this is the FR-003/SC-005 consistent-snapshot guarantee. It MUST NOT read the file store (the route streams the `stored` case) and MUST NOT write or trigger any write-back (FR-010 — `readContent` is a pure read; `apps/collab` is untouched). Export both from the domain package index so `apps/api` can import them. Make T002 green.

**Checkpoint**: Shared resolver complete and unit-tested — download use cases can adopt it.

---

## Phase 3: User Story 1 - Single-file download reflects latest edits (Priority: P1) 🎯 MVP

**Goal**: `GET /projects/:projectId/files/:fileNodeId/download` returns live Yjs text for an actively-edited document, while binary/dormant files still stream from disk with the same headers/filename.

**Independent Test**: Type an edit in an open document, download that single file immediately, and confirm the bytes contain the edit; download an image and confirm it streams unchanged.

### Tests for User Story 1 (write first, ensure they FAIL)

- [X] T004 [P] [US1] Extend domain use-case tests in `packages/domain/tests/use-cases/project/download-file.test.ts`: assert `execute` returns the resolved `DownloadContentSource` alongside `fileNode`/`filePath`; cover live-document ⇒ `inline` with live bytes, and no-document/dormant ⇒ `stored`. Keep existing membership/IDOR/folder-rejection assertions green. SECURITY assertion (S2): with a spy/fake `CollaborativeContentReader`, a non-member actor (and a cross-project IDOR file node) ⇒ the existing auth error AND the reader is NEVER called (no live read before authorization).
- [X] T005 [P] [US1] Extend route tests in `apps/api/tests/routes/projects/file-download.test.ts`: when the use case yields `inline`, the response body equals the live buffer and `Content-Disposition: attachment; filename="<name>"` is unchanged; when `stored`, the response is produced via `fileStore.readStream` (existing streaming path); 404 when the stored file is missing; auth/folder errors unchanged. SECURITY (S4): assert the response sets `Content-Type: application/octet-stream`.

### Implementation for User Story 1

- [X] T006 [US1] Update `DownloadFileUseCase` in `packages/domain/src/use-cases/project/download-file.ts`: inject `DocumentRepository`, `CollaborationSessionRepository`, `CollaborativeContentReader`, and an optional `Logger`. SECURITY (RBAC, Security Constitution): the resolver MUST run strictly AFTER the existing membership check and the cross-project IDOR guard (`fileNode.projectId === projectId`); on any auth failure, return the existing error WITHOUT calling the reader. Pass the request's already-authorized `projectId` (never a projectId re-derived from the document/yjsState) into `resolveDownloadContentSource`, then return its result in `DownloadFileResult` (add `source: DownloadContentSource`; keep `fileNode` and `filePath`). Make T004 green.
- [X] T007 [US1] Update the route in `apps/api/src/routes/projects/file-download.ts`: construct the use case with the new deps (`request.server.repos.document`, `request.server.repos.collaborationSession`, `request.server.stores.collaborativeContentEditor`, the logger from T001); map `source.kind === 'inline'` → send `source.bytes` (set the same `Content-Disposition: attachment` header), else stream `fileStore.readStream(projectId, filePath)` as today. No business logic beyond this mechanical mapping. SECURITY hardening (S4): set `Content-Type: application/octet-stream` on the single-file download response so a hostile source (e.g. `.html`) can never be content-sniffed/rendered inline — attachment disposition stays the primary control. Keep the rate-limit config on the route unchanged. Make T005 green.

**Checkpoint**: Single-file downloads are fresh for live documents and unchanged for everything else. MVP deliverable.

---

## Phase 4: User Story 2 - Project ZIP download reflects latest edits (Priority: P1)

**Goal**: `GET /projects/:projectId/download` writes each actively-edited document into the archive from live Yjs text, while non-edited and binary files stream from disk; archive layout and filename unchanged.

**Independent Test**: With several documents (some with live edits) plus an image, download the project ZIP and confirm each edited document reflects its live content, the image is intact, and the relative-path layout/filename are unchanged.

### Tests for User Story 2 (write first, ensure they FAIL)

- [X] T008 [P] [US2] Extend domain use-case tests in `packages/domain/tests/use-cases/project/download-project.test.ts`: assert each returned file carries a resolved `DownloadContentSource`; cover a mixed project (live document ⇒ `inline`, dormant document ⇒ `stored`, binary asset ⇒ `stored`); keep membership/relative-path/folder-exclusion assertions green.
- [X] T009 [P] [US2] Extend route tests in `apps/api/tests/routes/projects/download.test.ts`: a live document entry is appended from its `inline` buffer; `stored` entries are appended from `fileStore.readStream`; `Content-Type: application/zip`, the `<project>-<YYYY-MM-DD>.zip` filename, and relative paths are unchanged; a file missing from the store is still skipped with a warning.

### Implementation for User Story 2

- [X] T010 [US2] Update `DownloadProjectUseCase` in `packages/domain/src/use-cases/project/download-project.ts`: inject `DocumentRepository`, `CollaborationSessionRepository`, `CollaborativeContentReader`, optional `Logger`. SECURITY (RBAC + multi-tenant isolation): resolve content ONLY after the existing membership check passes; for each FILE node resolve its `DownloadContentSource` via the shared resolver, always passing the request's authorized `projectId` (so a live read can never cross project boundaries), and include it in `DownloadProjectFile` (alongside `fileNode`/`relativePath`). Make T008 green.
- [X] T011 [US2] Update the route in `apps/api/src/routes/projects/download.ts`: construct the use case with the new deps; in the archive loop, append `source.bytes` for `inline` entries (`{ name: relativePath }`) and `fileStore.readStream` for `stored` entries; preserve the existing skip-missing-file warning. Make T009 green.

**Checkpoint**: Both download surfaces serve up-to-date content; layouts unchanged.

---

## Phase 5: User Story 3 - Downloads stay reliable when collab is unavailable (Priority: P2)

**Goal**: A live-read failure (collab unreachable/timeout) or absent live source never fails a download; it falls back to the disk projection and logs a `warn`. For the ZIP, one file's live-read failure must not abort the whole archive.

**Independent Test**: With an active session, make the collaborative reader error; download the single file and the project ZIP — both succeed from disk and a `warn` is logged.

### Tests for User Story 3 (write first, ensure they FAIL)

- [X] T012 [P] [US3] Add resilience tests to `apps/api/tests/routes/projects/file-download.test.ts`: active session + reader returns `Result.error` ⇒ 200 with body streamed from disk, and a fallback `warn` is logged (use a fake reader that errors). SECURITY (S3): assert the client response carries NO internal error detail (just the file bytes, 200) and the logged warn is metadata-only (no document content, no secret). Mirror the same at the domain level if not already covered by T004.
- [X] T013 [P] [US3] Add resilience tests to `apps/api/tests/routes/projects/download.test.ts`: a project with one live document whose reader errors plus other files ⇒ the archive still finalizes, the failed file falls back to its disk bytes, others are correct, and a `warn` is logged (the loop must not throw out of `archive.append`). SECURITY (S3): the warn is metadata-only and no internal error detail leaks into the archive or response.

### Implementation for User Story 3

- [X] T014 [US3] Verify/realize fallback resilience: confirm `resolveDownloadContentSource` already converts a reader error to `{ kind: 'stored' }` + `warn` (from T003) so both use cases inherit it; ensure the project-ZIP route loop (T011) cannot throw on a per-file resolution and that resolution errors degrade to `stored` rather than aborting `archive.finalize()`. Make T012, T013 green with minimal changes.

**Checkpoint**: Downloads are dependable under collab degradation.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T015 [P] Run the quickstart manual smoke (`specs/031-up-to-date-downloads/quickstart.md`): live edit appears in single-file and ZIP downloads without waiting; stopping `apps/collab` still yields a successful download with a logged fallback. While doing so, confirm no `apps/web` file-tree download copy/tooltip implies "saved" vs "latest"; if any does, update it, otherwise record "no web change" (the plan expects none).
- [X] T016 Run quality gates: `pnpm lint`, `pnpm typecheck`, and the affected suites (`pnpm --filter @asciidocollab/domain test download-file download-project download-content-source`, `pnpm --filter @asciidocollab/api test file-download download`); ensure zero warnings/type errors and no `any`/`as` introduced.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; BLOCKS US1/US2/US3 (the shared resolver).
- **US1 (Phase 3)** and **US2 (Phase 4)**: depend only on Foundational; independent of each other (different use-case files and different route files) — parallelizable.
- **US3 (Phase 5)**: depends on Foundational; its tests assert behavior across US1/US2 surfaces, so run after the resolver exists (T003) and ideally after the routes adopt it (T007, T011).
- **Polish (Phase 6)**: after all desired stories.

### Within Each User Story

- Tests (T004/T005, T008/T009, T012/T013) MUST be written and FAIL before their implementation tasks.
- Use case before route (domain change exposes `source`, then the route maps it).

### Parallel Opportunities

- T004 ∥ T005 (different packages). T008 ∥ T009. T012 ∥ T013.
- After Phase 2: US1 (T006→T007) ∥ US2 (T010→T011) — different files, no shared edits.
- In Polish, T015 (manual smoke + web copy check) runs independently of T016 (gates).

---

## Parallel Example: After Foundational

```bash
# US1 and US2 can proceed concurrently (different files):
# Dev A — US1:
Task: "Extend packages/domain/tests/use-cases/project/download-file.test.ts (T004)"
Task: "Update DownloadFileUseCase + file-download.ts route (T006, T007)"
# Dev B — US2:
Task: "Extend packages/domain/tests/use-cases/project/download-project.test.ts (T008)"
Task: "Update DownloadProjectUseCase + download.ts route (T010, T011)"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → Phase 2 Foundational (shared resolver, tested).
2. Phase 3 US1 → single-file downloads are fresh. **STOP & VALIDATE** (quickstart steps 2–3).
3. Demo: type an edit, download the file, see the edit.

### Incremental Delivery

1. Foundational ready (resolver).
2. US1 (single-file) → test → demo (MVP).
3. US2 (project ZIP) → test → demo.
4. US3 (resilience) → test (collab-down fallback) → demo.
5. Polish: gates + quickstart.

---

## Notes

- [P] = different files, no dependency. US1/US2 are independent; US3 is a resilience overlay on the shared resolver.
- Streaming is preserved for `stored` files (binaries/dormant) — only live text is buffered.
- No schema change ⇒ no Prisma migration question. No new port/endpoint ⇒ `apps/collab` untouched.
- Downloads are `Content-Disposition: attachment` + `application/octet-stream` (no render path, no content-sniffing) ⇒ sanitizer boundary not engaged (Constitution VIII/IX).
- SECURITY decisions recorded (Security Constitution): (1) the new project-ZIP collab fan-out is bounded by the existing configurable per-endpoint download rate limit AND the `isActive` gate (collab calls ∝ open docs, not total files) — no new limit needed; (2) authorization (membership + IDOR) runs in the use case BEFORE any live read, with the request's authorized `projectId` always passed to the reader (no cross-tenant read); (3) the fallback `warn` logs metadata only and the client never receives internal error detail; (4) no new data exposure — members already see live content in the editor, and the internal `read-content` endpoint (loopback + optional secret/mTLS) gains a caller, not a new surface.
- FR-003/SC-005 (consistent snapshot) and FR-010 (pure read, no corruption/write-back) are guaranteed structurally: the resolver returns the reader's value verbatim, and the live read goes through the existing pure-read collab `read-content` path (untouched here). T002(f)/T003 assert the verbatim-snapshot property; the pure-read property is owned by `apps/collab` tests.
- SC-004 (no perceptible added wait) is a performance outcome and is intentionally NOT tasked — performance tests are opt-in per Constitution II and the spec did not request them.
- Total: 16 tasks (T001–T016).
- Commit after each green task or logical group; never commit red.
