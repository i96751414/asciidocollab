---
description: "Task list for file-tree open-file presence"
---

# Tasks: File-Tree Open-File Presence

**Input**: Design documents from `specs/024-file-tree-presence/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/presence-protocol.md, quickstart.md

**Tests**: INCLUDED (Constitution II — TDD, NON-NEGOTIABLE). Each production task is preceded by a failing test.

**Architecture** (research R1): a per-project **presence room** over Yjs **awareness** — `presence/<projectId>`. Clients publish `{ user, openFileNodeId }`; the file tree reads peers' awareness to mark files and list who. No DB/schema change; presence is ephemeral and self-clearing on disconnect.

**Access model** (verified, research R3): file access is **project-scoped** — a project member can access every file (no per-file ACLs). So presence is authorized by **project membership** (a thin new `AuthorizeProjectPresenceUseCase` reusing `ProjectMemberRepository`), and project-level auth fully satisfies SC-005 with **no** server-side per-file filtering.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 (Setup, Foundational, Polish carry no story label)

## Path Conventions

Tests live under each package/app `tests/` mirroring `src/` (e.g. `packages/domain/tests/use-cases/content/...` ↔ `src/use-cases/content/...`; `apps/web/tests/hooks/...` ↔ `src/hooks/...`).

---

## Phase 1: Setup (shared room-name convention)

**Purpose**: Establish the reserved presence-room shape both sides agree on.

- [X] T001 [P] Add web helpers `presenceRoomName(projectId)` → `presence/${projectId}` and `isPresenceRoom(name)` in `apps/web/src/lib/editor-config.ts` (alongside `collabRoomName`).
- [X] T002 [P] Add a collab-side recognizer `isPresenceRoom(documentName)` + `parsePresenceRoom(documentName)` → `ProjectId` in `apps/collab/src/server.ts` (distinct from `parseRoomName`'s `<projectId>/<yjsStateId>` form), with unit tests in `apps/collab/tests/server.test.ts`.

**Checkpoint**: Both sides can identify a presence room by name.

---

## Phase 2: Foundational (presence room backend — BLOCKS all user stories)

**⚠️ CRITICAL**: No marker can appear until the presence room is joinable, project-membership-authorized, and non-destructive (no session row, no persistence, cap-exempt).

### Domain authorization

- [X] T003 (test-first) Add `AuthorizeProjectPresenceUseCase(userId, projectId)` that returns ok when `ProjectMemberRepository.findByCompositeKey(projectId, userId)` exists and a typed denial otherwise (no collaboration role — presence is read-only). Write `packages/domain/tests/use-cases/content/authorize-project-presence.test.ts` first (member → ok, non-member → deny) using the in-memory `ProjectMemberRepository` fake; then implement `packages/domain/src/use-cases/content/authorize-project-presence.ts` and export it. (Constitution III.)

### API auth for presence rooms

- [X] T004 (test-first) In `apps/api/tests/routes/internal/collab-auth.test.ts`, add cases: an authorized project member requesting `documentName=presence/<projectId>` gets 200; a non-member gets 403; an unauthenticated request gets 401. Confirm RED.
- [X] T005 In `apps/api/src/routes/internal/collab-auth.ts`, detect the `presence/<projectId>` shape and authorize via `AuthorizeProjectPresenceUseCase` (project membership), returning a presence-appropriate body (no document role). Keep the existing document path unchanged. Make T004 green.

### Collab server: presence room as a first-class type

- [X] T006 (test-first) In `apps/collab/tests/extensions/auth-hook.test.ts`, add a case: a `presence/<projectId>` connection calls the auth endpoint and is accepted on project membership / denied (1008) otherwise, with the Origin allowlist still enforced. Confirm RED.
- [X] T007 In `apps/collab/src/extensions/auth-hook.ts`, detect the presence-room shape and authorize via the presence auth path. Make T006 green.
- [X] T008 (test-first) In `apps/collab/tests/server.test.ts`, assert a presence-room connection does NOT invoke `onRoomOpen`/`onRoomClose` and creates no `CollaborationSession` row. Then branch `apps/collab/src/server.ts` so presence rooms skip the document-session callbacks. Make green.
- [X] T009 (test-first) In `apps/collab/tests/extensions/persistence.test.ts`, assert `onLoadDocument`/`onStoreDocument` are no-ops for a presence room — no `parseRoomName`/`findByYjsStateId` call and **no document state read or written** (FR-011 guard). Then guard `apps/collab/src/extensions/persistence.ts`. Make green.
- [X] T010 (test-first) In `apps/collab/tests/extensions/connection-limit.test.ts`, assert a presence-room connection is NOT counted against the per-document connection/room caps, but an independent presence cap + the connect-rate limit still apply. Then update `apps/collab/src/extensions/connection-limit.ts`. Make green.

**Checkpoint**: A project member can join `presence/<projectId>`, exchange awareness, and leave — with no session row, no persistence, and no document-cap consumption; non-members are rejected.

---

## Phase 3: User Story 1 - See which files others have open (Priority: P1) 🎯 MVP

**Goal**: Files open by other users are visually marked in the file tree, updating in near-real-time.

**Independent Test**: With two accounts, user B opens a file; user A sees that file marked within a few seconds, and unopened files unmarked.

- [X] T011 [US1] (test-first) Write `apps/web/tests/hooks/use-project-presence.test.tsx` with a mocked awareness/provider: the hook publishes `{ user, openFileNodeId }`, returns `Map<fileNodeId, ParticipantPresence[]>` that excludes the local client and dedups by `userId`, and is **awareness-only — it binds no shared `Y.Doc` content** (FR-011 guard). Confirm RED.
- [X] T012 [US1] Implement `apps/web/src/hooks/use-project-presence.ts`: open one `HocuspocusProvider` to `presenceRoomName(projectId)`, publish local state via `buildAwarenessUser` + `openFileNodeId`, subscribe to awareness `change`, reduce peers into the per-file map (reuse the `collectParticipants` dedup/self-exclusion approach), and set no shared document content. Make T011 green.
- [X] T013 [US1] Feed the viewer's current `openFileNodeId` (from `useFileSelection`) into `useProjectPresence` in `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx`, and pass the resulting presence map to the file tree.
- [X] T014 [P] [US1] (test-first) Write `apps/web/tests/components/file-tree/open-by-others-marker.test.tsx`: the marker renders when ≥1 other participant holds the file, renders nothing for an empty/self-only set, and exposes an accessible label. Confirm RED.
- [X] T015 [US1] Implement `apps/web/src/components/file-tree/open-by-others-marker.tsx` — the indicator (avatar/dot cluster) using design tokens (light/dark) with a screen-reader label. Make T014 green.
- [X] T016 [US1] Thread the presence map through `apps/web/src/components/file-tree/file-tree.tsx` → `file-tree-node.tsx` and render `<OpenByOthersMarker>` for nodes whose `node.id` is a key in the map (after the name span, before the actions menu).

**Checkpoint**: Files open by others are marked in the tree and update live (MVP).

---

## Phase 4: User Story 2 - See who has a file open (Priority: P2)

**Goal**: Hovering/focusing a marker reveals which user(s) have the file open.

**Independent Test**: With B (and C) holding a file open, user A hovers the marker and sees exactly B (and C).

- [X] T017 [US2] (test-first) Extend `apps/web/tests/components/file-tree/open-by-others-marker.test.tsx`: hovering/focusing the marker reveals each participant (avatar + name), and a long list shows a bounded overflow ("+N more"). Confirm RED.
- [X] T018 [US2] Add a Radix Tooltip hover/focus panel to `open-by-others-marker.tsx` listing participants — reuse the `ParticipantChip` visual from `collab-presence-bar.tsx` — with bounded overflow. Make T017 green.

**Checkpoint**: The marker answers "who", matching the in-editor presence visual.

---

## Phase 5: User Story 3 - The signal stays accurate (Priority: P3)

**Goal**: Markers appear/clear promptly and never linger after a disconnect/crash.

**Independent Test**: B opens a file (A sees it), B closes/drops → A's marker clears within a few seconds; B in two tabs counts once.

- [X] T019 [P] [US3] (test) Extend `apps/web/tests/hooks/use-project-presence.test.tsx`: same `userId` across two awareness clients collapses to one participant (FR-009); the viewer's own `openFileNodeId` never appears in the map (FR-003).
- [X] T020 [P] [US3] (test) In the same hook test, simulate an awareness `change` removing a peer's entry and assert that file's participant list empties (clearing path, FR-007).
- [X] T021 [US3] Verify the awareness timeout clears a dropped client within the SC-003 ≤5s window; if the default is too slow, tune the presence-room awareness/outdated timeout in `apps/collab/src/server.ts` (presence-room config) and document it.
- [ ] T022 [US3] Add Playwright e2e `apps/web/e2e/collab-file-tree-presence.spec.ts`: two users — B opens a file → A sees the marker (≤3s); A hovers → sees B; B leaves → A's marker clears (≤5s).

**Checkpoint**: Presence is trustworthy under churn and disconnect.

---

## Phase 6: Polish & Cross-Cutting

- [X] T023 [P] Accessibility + theming pass on the marker/hover: keyboard-focusable, screen-reader label, legible and correct in both light and dark themes (SC-006); confirm no global/preview CSS touched (Constitution VI).
- [X] T024 Run the full quality gates: `npx eslint .`, `pnpm run typecheck`, `pnpm run fresh-onion`, `pnpm -r build`, `pnpm --filter @asciidocollab/domain exec jest`, `pnpm --filter @asciidocollab/collab exec jest --coverage` (90/90/90/90), `pnpm --filter @asciidocollab/web exec jest --coverage` (90/90/90/90), `pnpm --filter @asciidocollab/api exec jest`, `pnpm audit --audit-level=high`.
- [ ] T025 Run the `quickstart.md` end-to-end validation (incl. `pnpm e2e:local` with the new presence spec) and the manual smokes as the final acceptance pass.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational backend)** → **Phase 3 (US1 MVP)** → **Phase 4 (US2)** → **Phase 5 (US3)** → **Phase 6 (Polish)**.
- Foundational (T003–T010) BLOCKS all user stories: no marker can appear until the presence room is joinable/authorized/non-destructive.
- **US1 (P1)** depends on Foundational. **US2 (P2)** depends on US1 (adds the hover to the existing marker). **US3 (P3)** depends on US1 (marker accuracy) and exercises US2 in its e2e.

### Within phases

- T001 ‖ T002 (different files).
- Phase 2: **T003 (domain) before T005 (API uses it)**; T004→T005 (API test→impl); T006→T007 (auth-hook calls the API); T008/T009/T010 each test-first then implement (different files, can interleave after T007).
- US1: T011→T012 (hook) and T014→T015 (marker) are independent tracks; T013 needs T012; T016 needs T012+T015.
- US3: T019 ‖ T020 (same test file, different cases — coordinate); T022 needs US1+US2 shipped.

### Parallel opportunities

- T001 ‖ T002 (Setup).
- T011/T012 (hook) ‖ T014/T015 (marker) within US1.
- T019 ‖ T020 (US3 hook tests).
- T023 (a11y/theming) ‖ other polish.

---

## Parallel Example: User Story 1

```bash
# Two independent tracks after Foundational completes:
Task: "use-project-presence hook: test (T011) → implement (T012)"
Task: "open-by-others-marker: test (T014) → implement (T015)"
# then converge: T013 (feed openFileNodeId) and T016 (render in tree)
```

---

## Implementation Strategy

### MVP (US1 only)

1. Phase 1 (room convention) → Phase 2 (presence room backend: domain auth + API + collab) → Phase 3 (US1: files open by others are marked, live).
2. **STOP and VALIDATE**: two accounts; B opens a file, A sees it marked, clears when B leaves. The core ask is demoable.

### Incremental

3. Phase 4 (US2): hover reveals *who*.
4. Phase 5 (US3): prove accuracy/liveness (dedup, self-exclusion, clear-on-disconnect) + e2e.
5. Phase 6: a11y/theming + full gates + quickstart acceptance.

---

## Notes

- No new dependencies, no new entity/repository, no DB/schema change — one small domain use-case (`AuthorizeProjectPresence`) reusing `ProjectMemberRepository`; presence itself is ephemeral awareness state (data-model.md).
- Reuse first (Constitution IV): `buildAwarenessUser`/`colorForUser`, the `collectParticipants` dedup, the `ParticipantChip` visual, the Radix Tooltip pattern, and `ProjectMemberRepository`.
- Security (SC-005): the presence auth path (T003/T004/T005) is the critical review item — a project-member-only gate, test-first. Access is project-scoped (verified), so no per-file filtering is needed.
- FR-011 (presence-only) is guarded explicitly by T009 (no document state read/written for presence rooms) and T011 (the hook binds no shared `Y.Doc` content).
- Liveness (SC-004) is provided by awareness, not application code — do not add a custom heartbeat/watchdog.
- Commit after each logical group; never commit with failing tests (Constitution II).
