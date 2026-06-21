# Contracts: Up-to-Date Downloads

**Feature**: 031-up-to-date-downloads | **Date**: 2026-06-21

No public HTTP surface changes. The two download endpoints keep their methods, paths, params, auth, rate limits, headers, filenames, and archive layout. Only the **freshness of the bytes** changes. This document captures the behavioral contract and the reused internal contract.

---

## Security & rate-limiting decision (Security Constitution — recorded)

The Security Constitution requires that for amplifying/bulk-read endpoints the rate-limit decision be **deliberate and recorded** (not blanket, not silently omitted):

- Both download routes keep their existing configurable limits — `downloads.file.{rateLimitMax,rateLimitWindow}` and `downloads.zip.{rateLimitMax,rateLimitWindow}` in `apps/api/src/config/schema.ts` (env-driven, no hardcoded literal), each returning `429` on breach.
- This feature adds a **per-request fan-out of internal collab `read-content` calls** to the ZIP path (and at most one to the single-file path). That amplification is bounded by: (a) the existing per-endpoint rate limit above, and (b) the `CollaborationSessionRepository.isActive` gate, so collab calls are proportional to the number of **currently-edited** files, not the total file count. **No new or stricter limit is required**; the existing limits remain adequate.
- Authorization is enforced in the domain use case (membership + cross-project IDOR) **before** any live read; the request's authorized `projectId` is always the one passed to `read-content`, so a live read cannot cross project boundaries.
- Single-file responses set `Content-Type: application/octet-stream` alongside `Content-Disposition: attachment` so user source can never be content-sniffed/rendered inline.
- The collab-unreachable fallback logs metadata only (ids/path + error message — no document bytes, no secret) and returns the file bytes with no internal detail leaked to the client.

---

## 1. `GET /projects/:projectId/files/:fileNodeId/download` (single file)

**Unchanged**: auth (`requireAuth` + membership), rate limit (`downloads.file.*`, `429` on breach), `Content-Disposition: attachment; filename="<fileNode.name>"`, 403/404/400 error mapping, folder rejection.

**Hardened**: response now sets `Content-Type: application/octet-stream` (S4).

**New behavioral guarantee**:
- If the file is an actively-edited document (has a `Document` and `CollaborationSession.isActive`), the response body is the **live Yjs text** as of the request.
- Otherwise (dormant document, binary asset, no session, live read returns `null`, or the collab server is unreachable), the response body is streamed from the disk projection exactly as today.
- The download always completes when the file exists; collab unavailability never turns a 200 into an error (FR-005).

**Response body source matrix**:

| File state | Body source |
|------------|-------------|
| Document + active session + live text available | Live Yjs text (in-memory buffer) |
| Document + active session + live read returns `null` | Disk projection (stream) |
| Document + active session + collab unreachable (error) | Disk projection (stream), `warn` logged |
| Document + no active session | Disk projection (stream) |
| Binary asset / non-document file | Disk projection (stream) |
| File missing from store | 404 `FILE_NOT_FOUND` (unchanged) |

---

## 2. `GET /projects/:projectId/download` (project ZIP)

**Unchanged**: auth, rate limit, `Content-Type: application/zip`, `Content-Disposition: attachment; filename="<project>-<YYYY-MM-DD>.zip"`, relative-path layout, skip-missing-file warning, archiver settings.

**New behavioral guarantee**:
- Each archived file independently follows the single-file source matrix above: actively-edited documents are written from live Yjs text; everything else streams from disk.
- The set of files included is the current project file structure (`findByProjectId`, FILE nodes) — unchanged (FR-011).
- A live-read failure for one file falls back to that file's disk projection and never aborts the whole archive (FR-005).

---

## 3. Reused internal contract (no change) — collab `read-content`

`POST /internal/collab/read-content` on the collab server (loopback; optional shared secret / mTLS).

- **Request**: `{ projectId: string, yjsStateId: string }`
- **Response**: `{ content: string | null }` — `content` is the live document text, or `null` when there is no live source (a never-opened/dormant document with no persisted Yjs state).
- Consumed via `CollaborativeContentReader.readContent(projectId, yjsStateId): Promise<Result<string | null, Error>>`.
- This is a **pure read**: it must not trigger a write-back or mutate state.

This contract is already implemented and used by feature 027; this feature adds the download path as a second caller and does not modify it.

---

## Test contract (acceptance → tests)

Domain use-case tests (in-memory fakes) and Fastify route tests must cover, for both single-file and project ZIP:

1. **Live freshness** — active session + reader returns text ⇒ body/entry contains the live text, not the (stale) disk bytes.
2. **Dormant document** — document but no active session ⇒ disk projection served; reader NOT called.
3. **Collab error fallback** — active session + reader returns error ⇒ disk projection served, download completes, `warn` logged.
4. **Live null fallback** — active session + reader returns `null` ⇒ disk projection served.
5. **Binary/non-document** — no document ⇒ disk projection streamed (no buffering, reader NOT called).
6. **Authorization unchanged** — non-member ⇒ 403; folder ⇒ 400; cross-project IDOR ⇒ 404.
7. **ZIP mixed** — a project with a live document + a dormant document + a binary asset ⇒ each entry sourced correctly; layout/filename unchanged.
8. **Auth-before-read (S2)** — non-member / cross-project IDOR ⇒ the collaborative reader is NEVER called (no live read before authorization); the live read always uses the request's authorized `projectId`.
9. **No leak on fallback (S3)** — collab-error fallback ⇒ client gets only file bytes (200); the `warn` payload is metadata-only (no document content, no secret).
10. **Inert content type (S4)** — single-file response sets `Content-Type: application/octet-stream`.
