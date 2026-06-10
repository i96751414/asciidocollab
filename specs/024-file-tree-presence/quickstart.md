# Quickstart: File-Tree Open-File Presence

How to build and verify the feature. No new dependencies; reuses the existing Hocuspocus/Yjs awareness stack.

## Build order (by layer)

1. **Collab server — presence room as a first-class type** (`apps/collab/src`)
   - In `server.ts`, detect the `presence/<projectId>` room shape and branch the lifecycle: skip `onRoomOpen`/`onRoomClose` and the `CollaborationSession` writes for presence rooms.
   - In `extensions/persistence.ts`, no-op `onLoadDocument`/`onStoreDocument` for presence rooms (guard before `parseRoomName`).
   - In `extensions/connection-limit.ts`, exempt presence rooms from the per-document caps (keep an independent presence cap + rate limit).
   - Tests-first: presence-room connect is authorized, creates no session row, loads no document, and is not counted against document caps.

2. **API — presence auth** (`apps/api/src/routes/internal/collab-auth.ts`)
   - Detect `documentName=presence/<projectId>`; authorize by project access (reuse the existing project-access check); return a presence-ok body. Reject when the user lacks project access.
   - Tests-first: authorized member → 200; non-member → non-200.

3. **Web — presence subscription + marker** (`apps/web/src`)
   - `hooks/use-project-presence.ts`: open one `HocuspocusProvider` to `presence/<projectId>`, publish `{ user: buildAwarenessUser(identity), openFileNodeId }`, return `Map<fileNodeId, ParticipantPresence[]>` (exclude self, dedup by userId — reuse `collectParticipants`).
   - `components/file-tree/open-by-others-marker.tsx`: marker + Radix Tooltip listing participants (reuse `ParticipantChip` visual + tokens).
   - Thread the map through `file-tree.tsx` → `file-tree-node.tsx`; feed the viewer's current `openFileNodeId` from `project-editor-layout.tsx` (it already knows the selected file).
   - Tests-first with a mocked awareness object (existing pattern in `use-collab-presence.test.tsx`).

## Verify behavior (acceptance baseline)

```bash
# Unit suites
pnpm --filter @asciidocollab/collab exec jest
pnpm --filter @asciidocollab/api exec jest
pnpm --filter @asciidocollab/web exec jest

# Full quality gates
npx eslint .
pnpm run typecheck
pnpm run fresh-onion
pnpm -r build
pnpm --filter @asciidocollab/collab exec jest --coverage   # 90/90/90/90
pnpm --filter @asciidocollab/web exec jest --coverage      # 90/90/90/90
pnpm audit --audit-level=high

# End-to-end (isolated stack), incl. the new presence spec
pnpm e2e:local        # apps/web/e2e/collab-file-tree-presence.spec.ts
```

## Manual smoke (matches spec P1/P2/P3)

1. **Two users, same project.** User B opens `file-x.adoc`. → User A, viewing the tree, sees `file-x.adoc` marked within ~3s (SC-001).
2. **Who.** User A hovers the marker → sees B's name/avatar; with B and C both in the file, both are listed (FR-004/FR-005).
3. **Self excluded.** User A opens `file-y.adoc` themselves → `file-y.adoc` is not marked as "open by others" for A (FR-003).
4. **Liveness.** B closes the file (or drops connection) → A's marker for `file-x.adoc` clears within ~5s; no stale marker after a hard disconnect (SC-003/SC-004).
5. **Access.** A user without access to the project receives no presence and cannot join the presence room (SC-005).
6. **Theming/a11y.** Marker + hover are legible in light and dark and reachable/labelled via keyboard (SC-006).

## Done when

- Files open by other users are marked in the tree (≤3s), the hover lists exactly the right users, and markers clear (≤5s) — including after a crash.
- No document content flows through the presence room; `CollaborationSession` and the edit lock are unaffected.
- No presence leaks outside a viewer's access.
- All quality gates green (lint, typecheck, fresh-onion, build, coverage collab+web, audit, e2e).
