# Implementation Plan: File-Tree Open-File Presence

**Branch**: `024-file-tree-presence` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/024-file-tree-presence/spec.md`

## Summary

Show, in a project's file tree, which files are currently open by **other** users, with a hover revealing **who**. The hard part is that today the system has no project-wide, user-attributed "who has what open" signal: `CollaborationSession` tracks documents-not-users, per-document Yjs **awareness** only covers the single open file, and no server API exposes room membership.

**Chosen approach**: a per-project **presence room** over the existing Hocuspocus/Yjs **awareness** channel. Every client viewing a project opens one lightweight provider to a dedicated presence room and publishes awareness state `{ user, openFileNodeId }`. The file tree subscribes to that room's awareness and marks files whose `openFileNodeId` is published by another user; the hover reuses the in-document presence visual (avatar + name). Awareness gives **real-time updates, automatic liveness (state clears on disconnect/crash), and user identity for free** — directly satisfying the marker, the who-on-hover, and the no-stale requirements. This reuses the exact mechanism that already powers the in-editor presence bar.

The work is: make the collab server treat **presence rooms as a first-class room type** (project-scoped auth, no document-session lifecycle, no Yjs persistence, exempt from per-document connection caps), add a web `useProjectPresence` hook + a file-tree marker, and wire identity/dedup via the existing `AwarenessUser` helpers.

## Technical Context

**Language/Version**: TypeScript; Node 24 (collab + api), Next.js 16 web; pnpm monorepo.

**Primary Dependencies**: existing stack only — `@hocuspocus/server`/`@hocuspocus/provider` 4.1.1, `yjs` 13.6.31, `y-protocols` awareness; Radix Tooltip; design-token theming. No new dependencies.

**Storage**: None new. Presence is **ephemeral** (in-memory awareness, server-mediated); nothing persisted, no schema change, no audit record.

**Testing**: jest + ts-jest per package (collab 90/90/90/90, web 90/90/90/90); Playwright collab e2e in `apps/web/e2e`; in-memory fakes for domain seams; awareness/provider mocked at the IO boundary (existing pattern in `use-collab-presence.test.tsx`).

**Target Platform**: Browser (web client file tree), Node collab WS server, Node API (auth).

**Project Type**: Web — real-time collaboration UX feature spanning `apps/web` (UI + hook) and `apps/collab` (presence-room handling) + a small `apps/api` auth path.

**Performance Goals**: Marker appears ≤3s after another user opens a file (SC-001); clears ≤5s after the last other user leaves (SC-003); awareness is push-based so these are well within reach.

**Constraints**:
- `ConnectionLimitExtension` caps connections/rooms per user — the persistent presence connection MUST NOT consume a user's document-room budget (exempt presence rooms or account for them).
- Presence rooms MUST bypass `PersistenceExtension` and the `onRoomOpen/onRoomClose` `CollaborationSession` lifecycle (no `yjsStateId`, no document, no DB row).
- Access control: a client may only join its project's presence room and only sees presence for files it can access (FR-008 / SC-005).
- The file tree keys nodes by `fileNodeId`; presence MUST be published/keyed by `fileNodeId` (the tree never holds `yjsStateId`).

**Scale/Scope**: One extra WS connection per (user, open project tab); presence payload is tiny (user identity + one file id). v1 marks files (no folder roll-up).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **II. TDD (NON-NEGOTIABLE)** — New web hook (`useProjectPresence`), the file-tree marker/hover component, and the collab-server presence-room branch are all driven test-first (the codebase already tests awareness via mocked awareness objects). **PASS**.
- **III. Seam Testing with In-Memory Fakes** — No new repository is required (presence is ephemeral). One small new domain use-case (`AuthorizeProjectPresenceUseCase`, project-membership gate) reuses the existing `ProjectMemberRepository` and ships with its in-memory fake + unit test; awareness/provider stay mocked at the IO boundary (permitted by III). **PASS**.
- **IV. Reuse Before Rebuild** — Reuses `HocuspocusProvider`, `AwarenessUser`/`buildAwarenessUser`/`colorForUser`, the `useCollabPresence` dedup pattern, the `ParticipantChip` avatar visual, and the Radix Tooltip pattern. No re-derivation. **PASS**.
- **V. Theming via Design Tokens** — The marker + hover use design tokens and are correct in light/dark (FR-010 / SC-006). **PASS**.
- **VI. Style Isolation** — N/A (this is app chrome, not rendered-document styling). No global preview CSS touched.
- **VII. Per-User Preferences, Shared Content Immutability** — Presence is shared *ephemeral* state, not a stored preference, and is strictly read-only w.r.t. document content (FR-011). One user's presence never alters another's document view. **PASS**.
- **VIII. Editor Pipeline Integrity (Sanitization & Scroll-Sync)** — Not touched; the presence room carries no document content and does not feed the preview or scroll-sync seams. **PASS (no change).**
- **Security** (`.specify/memory/security_constitution.md`) — A new auth path authorizes presence-room joins by **project membership** (reusing existing project-access authorization); presence never leaks files outside the viewer's access (SC-005). The presence room carries no document content, reducing exposure. **PASS (auth path is the key review item).**
- **Architecture** (`.specify/memory/architecture_constitution.md`) — No new domain entity or repository and no DB change; one small domain use-case (`AuthorizeProjectPresenceUseCase`) reuses the existing `ProjectMemberRepository`, consumed by the API auth route. Remaining changes live in the app layer (`apps/collab`, `apps/web`). No new cross-layer dependency, no forward dependency. **PASS**.

No violations → Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/024-file-tree-presence/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (ephemeral awareness shape; no DB)
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── presence-protocol.md
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
apps/collab/                          # Presence-room handling (first-class room type)
└── src/
    ├── server.ts                     # detect presence rooms; skip onRoomOpen/onRoomClose + maxPayload as needed
    ├── extensions/
    │   ├── persistence.ts            # no-op for presence rooms (no yjsState/document)
    │   ├── auth-hook.ts              # presence-room auth: authorize by project membership
    │   └── connection-limit.ts       # exempt/account presence rooms in per-user caps

packages/domain/                      # project-membership authorization for presence
└── src/use-cases/content/authorize-project-presence.ts # NEW: AuthorizeProjectPresence (reuses ProjectMemberRepository)

apps/api/                             # auth for presence rooms
└── src/routes/internal/collab-auth.ts # presence/<projectId> → AuthorizeProjectPresence (project membership)

apps/web/                             # UI + presence subscription
└── src/
    ├── hooks/use-project-presence.ts # NEW: open presence-room provider, publish {user, openFileNodeId}, read others
    ├── lib/collab/awareness-user.ts  # reuse identity/color helpers (extend state with openFileNodeId)
    ├── components/file-tree/
    │   ├── file-tree.tsx             # thread presence map → nodes
    │   ├── file-tree-node.tsx        # render the per-file marker + hover (Radix Tooltip)
    │   └── open-by-others-marker.tsx # NEW: marker + hover list (reuses ParticipantChip visual)
    └── app/(dashboard)/.../project-editor-layout.tsx # publish the viewer's current openFileNodeId into presence
```

**Structure Decision**: No restructure. A new web hook + marker component, a first-class "presence room" branch in the collab server (auth/persistence/limits), a small `AuthorizeProjectPresence` domain use-case (reusing `ProjectMemberRepository`), and a presence-room auth path in the API that calls it. The presence room is a clean, named generalization of the existing room concept — not a special-case bandaid (see research.md R1/R2).

## Complexity Tracking

> No Constitution violations — section intentionally empty.
