# Research: Up-to-Date Downloads

**Feature**: 031-up-to-date-downloads | **Date**: 2026-06-21

This feature has **no open `NEEDS CLARIFICATION`**. The research below records the design decisions and, per Constitution Principle IV, the reuse analysis that proves no new mechanism needs to be built.

---

## Decision 1 — Source of "up-to-date" content

**Decision**: Treat the live Yjs document held by the collab server as the authoritative source for any file that is an actively-edited document. Read it through the existing `CollaborativeContentReader` port; fall back to the file-store projection on disk otherwise.

**Rationale**: The file store under `storageRoot/<projectId>/` is only a *projection* of the Yjs state, written back on debounce (≈2 s) / max-debounce (default 30 s via `COLLAB_WRITEBACK_INTERVAL_KEY`) / on-disconnect. It can lag unsaved edits (and stays stale across a restart until the next write-back). The collab server's `readDocumentContent` returns the in-memory `Y.Doc` text when the room is loaded, else decodes the persisted Yjs state — both reflect edits not yet projected to disk. This is exactly the freshness the spec requires (FR-001, FR-002).

**Alternatives considered**:
- *Force a sync-to-disk before reading* (trigger `onStoreDocument`, then read disk). Rejected: it mutates/persists as a side effect of a read, couples download latency to a write-back, and `readContent` already gives a pure-read snapshot without that coupling (respects FR-010 / Principle VII).
- *Read the persisted Yjs state blob directly from `YjsStateStore` in the API*. Rejected: that blob can itself lag the in-memory doc (it is only saved on the same debounce), so it would not capture the freshest edits; the collab server's in-memory doc is the true source. `readContent` already prefers it.

---

## Decision 2 — Reuse the feature-027 live-read stack (no rebuild)

**Decision**: Reuse, unchanged:
- Port `CollaborativeContentReader.readContent(projectId, yjsStateId): Result<string | null, Error>` (`packages/domain/src/ports/storage/collaborative-content-reader.ts`).
- Adapter `HttpCollaborativeContentEditor` (`packages/infrastructure/.../http-collaborative-content-editor.ts`), already wired into `apps/api` stores as `collaborativeContentEditor` (`apps/api/src/di/stores.ts`), including its optional shared-secret / mTLS config.
- Collab endpoint `POST /internal/collab/read-content` (`apps/collab/src/internal-edit-server.ts` → `readDocumentContent` in `apply-edits.ts`).
- The resolution pattern in `GetFileNodeContentUseCase` / `resolveFileContent` (`packages/domain/src/use-cases/content/`), including the **session-active gate**.

**Rationale (Principle IV)**: Feature 027 (cross-document attributes / symbol rename / find-usages) already solved "read a document's current text preferring live Yjs, with logged fallback to disk." Downloads are another reader of the same truth. Building a second path would invite drift and a second place to get the fallback/security wrong. No vendorable third-party asset applies; this is reuse of a first-party asset the project already owns.

**Alternatives considered**:
- *New batch read endpoint on the collab server* (`read-content` for many `yjsStateId`s at once) to make project ZIP a single round-trip. Rejected for v1: adds collab surface for an unproven need; the session-active gate already limits calls to *actively-edited* files only, and loopback round-trips are cheap. Recorded as a future optimization if a large-project profile ever justifies it.

---

## Decision 3 — Preserve streaming; only buffer live text

**Decision**: Keep streaming from disk (`ProjectFileStore.readStream`) for every file that is **not** served from live content. Only files resolved to live Yjs text are served as an in-memory `Buffer` (their text is already wholly in memory in the collab process).

**Rationale**: Binary assets (images) and large files never have an active text document, so they keep the current memory-efficient streaming profile (no regression). Live documents are text and small, so buffering their string is acceptable. This keeps FR-006 (binary/non-edited files unchanged) and avoids loading whole binaries into RAM.

**Implementation shape**: The download use case resolves, per file, a discriminated **content source**:
- `{ kind: 'inline', bytes: Buffer }` — live text obtained, or
- `{ kind: 'stored' }` — route streams `fileStore.readStream(projectId, fileNode.path)`.

The route maps this mechanically to the response (single file: send buffer **or** pipe stream; ZIP: `archive.append(buffer | stream, { name })`). The *decision* stays in the domain use case; the route stays logic-free (Architecture Constitution: no business logic in handlers).

---

## Decision 4 — When to consult the collab server (gating)

**Decision**: Consult `CollaborativeContentReader` only when the file has a `Document` **and** `CollaborationSessionRepository.isActive(projectId, document.id)` is true. Otherwise read from disk directly.

**Rationale**: A dormant document's file-store projection is already current (the collab server writes back on disconnect), so the blocking collab round-trip is pure overhead. This mirrors `GetFileNodeContentUseCase` exactly and keeps project-ZIP collab calls proportional to the number of files currently being edited (FR-002 freshness without per-file overhead for idle files). Matches spec assumption that a small, bounded freshness step is acceptable.

**Edge consequence (consistent with spec FR-004)**: A file with an active session but for which the live read returns `null` (room exists but no persisted/in-memory text yet) or errors → fall back to disk. A file with no session → disk. Both are correct and complete the download.

---

## Decision 5 — Failure handling (collab unreachable)

**Decision**: A live read that returns `Result.error` (e.g., collab server unreachable / timeout) is logged at `warn` and falls back to the disk projection; the download still completes (FR-005). A `null` value (no live source) falls through silently to disk.

**Rationale**: Downloads must remain dependable even when the collab service is degraded (User Story 3). This is the established behavior of `GetFileNodeContentUseCase`; reusing it keeps the degradation observable (diagnosable stale-content fallback) rather than silent or fatal.

---

## Decision 6 — Security & boundaries

**Decision**: No change to authorization, sanitization, or sandboxing.

**Rationale**:
- Authorization: the existing `DownloadFileUseCase` / `DownloadProjectUseCase` membership + IDOR checks are retained verbatim (FR-007). The collab `read-content` endpoint is loopback/secret/mTLS-gated as today.
- Sanitization (Principle VIII/IX): downloads are `Content-Disposition: attachment` and never enter the editor/preview render pipeline, so no sanitizer is engaged or weakened, and no new render surface is created.
- Sandbox (Principle IX): `yjsStateId` is resolved only within the requesting project; the disk fallback continues through `resolveSafe` (path-traversal guard). No remote fetch is introduced.

---

## Open questions deferred to `/speckit-tasks`

- Exact concurrency bound for resolving live content across many files in a project ZIP (sequential vs small fan-out). Functional correctness is independent of this; pick the simplest that keeps memory bounded.
- Whether to thread an existing `Logger` port into the download use cases for the fallback `warn` (reuse the pattern already in `GetFileNodeContentUseCase`).
