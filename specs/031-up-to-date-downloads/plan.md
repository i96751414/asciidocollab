# Implementation Plan: Up-to-Date Downloads

**Branch**: `031-up-to-date-downloads` | **Date**: 2026-06-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/031-up-to-date-downloads/spec.md`

## Summary

Today both download paths — single file (`GET /projects/:projectId/files/:fileNodeId/download`) and project ZIP (`GET /projects/:projectId/download`) — stream bytes straight from the file-store projection on disk. That projection lags the authoritative Yjs state, which the collab server only writes back on a debounce (≈2 s) / max-debounce (default 30 s) / on-disconnect. A user who downloads right after typing can therefore receive stale content.

The fix reuses the **already-built** live-content resolution pattern (`CollaborativeContentReader` port → `HttpCollaborativeContentEditor` → the collab server's `/internal/collab/read-content` endpoint, gated by `CollaborationSessionRepository.isActive`). For each downloaded file that is an actively-edited document, the download serves the **live Yjs text**; otherwise it streams the disk projection unchanged. A live-read error (collab unreachable) or a dormant document falls back to disk so the download always completes. No new HTTP surface, no schema change, no new render path.

## Technical Context

**Language/Version**: TypeScript (Node.js, ESM); React/Next.js 16 for web (no web changes expected)

**Primary Dependencies**: Fastify (`apps/api`), Hocuspocus v4 + Yjs (`apps/collab`), `archiver` (ZIP), existing `@asciidocollab/domain` ports

**Storage**: Filesystem project file store + filesystem Yjs state store (both under `storageRoot/<projectId>/`); PostgreSQL via Prisma for `FileNode`/`Document`/`CollaborationSession`

**Testing**: Jest + in-memory fakes (domain use cases); Fastify route tests (`apps/api/tests`)

**Target Platform**: Linux server (modular monolith; `apps/api` and `apps/collab` are separate processes on the same host over loopback)

**Project Type**: Web application (monorepo: `apps/api`, `apps/collab`, `apps/web`, `packages/*`)

**Performance Goals**: Not specified by the spec; performance/load tests are OPT-IN per Constitution II and are NOT added. Functional behavior only. A bounded approach (session-active gate + small concurrency for ZIP) keeps collab round-trips proportional to the number of *actively-edited* files, not total files.

**Constraints**: Downloads MUST keep streaming binary/large files from disk (no full-buffer regression); live reads MUST be a pure read with no write-back; existing authorization unchanged; download is served as an attachment (no render path). Security (recorded per Security Constitution): the new project-ZIP collab fan-out is bounded by the existing configurable per-endpoint download rate limit plus the `isActive` session gate (collab calls ∝ open docs, not total files), so no new limit is needed; authorization (membership + IDOR) runs in the use case before any live read and the request's authorized `projectId` is always passed to `read-content` (no cross-tenant read); the single-file response sets `Content-Type: application/octet-stream`; the collab-unreachable fallback logs metadata only and leaks no internal detail to the client.

**Scale/Scope**: Two API routes + their two domain use cases + supporting tests. No frontend change. No DB migration.

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v2.3.0 and `architecture_constitution.md` v2.4.0.*

- **I. Clean Code** — PASS. The live-vs-stored decision is expressed as a small, named content-source resolution reusing existing helpers; explicit fallback path; no magic values.
- **II. TDD (NON-NEGOTIABLE)** — PASS (planned). Every change is red-green: domain use-case tests with in-memory fakes added/extended first, then route integration tests, then implementation. No performance/load/benchmark tests (opt-in; spec does not request them — their absence is not a coverage gap).
- **III. Seam Testing with In-Memory Fakes** — PASS. Reuses existing fakes: `CollaborativeContentReader`, `DocumentRepository`, `CollaborationSessionRepository` (`in-memory-collaboration-session-repository.ts`), `ProjectFileStore`. No mocking of repositories.
- **IV. Reuse Before Rebuild** — PASS, and central to this plan. The live-read port, HTTP adapter, collab `read-content` endpoint, and the `resolveFileContent` / `GetFileNodeContentUseCase` session-gated pattern already exist (feature 027). This feature **wires existing assets into the download path** rather than building a parallel mechanism. Documented in research.md.
- **V. Theming via Design Tokens** — N/A (no UI styling change).
- **VI. Style Isolation** — N/A (no rendered-document styles).
- **VII. Per-User Preferences / Shared Content Immutability** — PASS. Reads are pure; no preference introduced; no shared content mutated. `readContent` explicitly does not trigger a write-back.
- **VIII. Editor Pipeline Integrity (Sanitization & Scroll-Sync)** — PASS / not engaged. Downloads are served with `Content-Disposition: attachment` and do **not** pass through the editor or preview render pipeline; the sanitizer boundary is therefore neither touched, widened, nor bypassed. Scroll-sync is unaffected. The bytes served are exactly the document text the editor already holds.
- **IX. Untrusted Input Boundary (NON-NEGOTIABLE)** — PASS. No new externally-sourced content enters the editor/render pipeline. Path resolution remains sandbox-confined: the room name is `<projectId>/<yjsStateId>` (project-scoped), `yjsStateId` is resolved only within the requesting project, and `FilesystemProjectFileStore.resolveSafe` continues to guard path traversal for the disk fallback. No remote fetch, no new allow-list.

**Security constitution**: PASS (decisions recorded). RBAC stays in the domain — membership + cross-project IDOR are enforced in the use case before any live read, and the reader is never called on an auth failure (no route-duplicated check). Rate limiting: both download routes keep their env-driven, configurable limits; the added collab fan-out is an *amplification* of an already-limited route and is further bounded by the `isActive` gate — the decision to keep (not add) limits is recorded in `contracts/downloads.md` per the "deliberate, documented" rule. Data isolation: the live read is scoped to `(authorized projectId, yjsStateId-from-authorized-document)`, so no cross-tenant access. Logging: the fallback `warn` is metadata-only (ids/path), and the client receives no internal error detail (typed errors do not leak internal state). No new internet-facing surface — `read-content` is the existing loopback/secret/mTLS internal endpoint gaining one more caller. Response hardening: single-file download sets `application/octet-stream`.

**Architecture constitution**: PASS. Business logic stays in domain use cases (the route performs only mechanical mapping of a resolved content source to an HTTP response); communication via existing domain ports; no cross-package type duplication; no `any`/`as`; tests live under each package's `tests/` tree. No Prisma schema change ⇒ no migration approval needed.

**Result**: No violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/031-up-to-date-downloads/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions & reuse analysis
├── data-model.md        # Phase 1 — entities/ports involved (no schema change)
├── quickstart.md        # Phase 1 — how to verify the freshness behavior
├── contracts/           # Phase 1 — download freshness contract + internal read-content reuse
│   └── downloads.md
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT this command)
```

### Source Code (repository root)

```text
apps/api/
├── src/routes/projects/
│   ├── file-download.ts        # MODIFY: map resolved content source → stream or inline buffer
│   └── download.ts             # MODIFY: per-file resolve live vs stored, append to archive
├── src/di/
│   ├── repositories.ts         # (reuse) document + collaborationSession repos already wired
│   └── stores.ts               # (reuse) collaborativeContentEditor already wired
└── tests/routes/projects/
    ├── file-download.test.ts   # EXTEND: live-content + fallback cases
    └── download.test.ts        # EXTEND: live-content + per-file fallback cases

packages/domain/
├── src/use-cases/project/
│   ├── download-file.ts        # MODIFY: resolve content source (live vs stored)
│   └── download-project.ts     # MODIFY: include per-file content-source resolution
├── src/use-cases/content/
│   └── live-content.ts         # (reuse) resolveFileContent / liveContentDeps pattern
└── tests/use-cases/project/
    ├── download-file.test.ts   # EXTEND: live, dormant, collab-error fallback
    └── download-project.test.ts# EXTEND: mixed live/stored/binary files

apps/collab/
└── src/                        # NO CHANGE — read-content endpoint already exists
```

**Structure Decision**: Standard modular-monolith layout. The change is confined to the two download routes (`apps/api`) and their two domain use cases (`packages/domain`), reusing ports/adapters/endpoints from feature 027. `apps/collab` and `apps/web` are unchanged. No new package, no new port, no schema change.

## Complexity Tracking

No Constitution violations — this section intentionally left empty.
