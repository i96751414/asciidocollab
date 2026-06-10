# Phase 0 Research: File-Tree Open-File Presence

## R1 — How to surface project-wide "who has which file open" (the core decision)

**Decision**: A per-project **presence room** over Hocuspocus/Yjs **awareness**. Every client viewing a project joins one lightweight presence room and publishes awareness `{ user, openFileNodeId }`; the file tree reads all peers' awareness to mark files and list who.

**Why** (the requirements that drive it):
- FR-006 real-time updates, FR-007 **no stale markers on disconnect/crash**, FR-004 user identity, FR-009 multi-tab dedup — **awareness provides all four natively**. Awareness state is keyed by client, broadcast on change, and **auto-removed when a connection drops** (the protocol's whole purpose). This is the same mechanism already powering the in-editor presence bar (`use-collab-presence.ts`), so it is reuse, not rebuild (Constitution IV).
- No persistence, no DB schema, no audit footprint — presence is inherently ephemeral (matches the spec assumption and keeps it cleanly separate from the audit-log feature).

**Alternatives considered**:

- **(B) DB-backed per-user sessions + the existing project SSE stream.** Extend `CollaborationSession` (or a join table) to record `(projectId, documentId, userId)` on connect and surface changes over the `GET /projects/:id/events` SSE the file tree already consumes. *Rejected as primary* because it must re-implement what awareness gives free: per-**user** liveness on abnormal disconnect (the current room teardown + watchdog clean rooms, not per-user rows), plus DB write churn on every open/close and a `documentId→fileNodeId` translation. More moving parts, weaker liveness guarantee. (Kept as the fallback if the presence-room connection cost proves unacceptable.)
- **(C) Server-aggregated room-membership API polled by the web app.** The collab server already knows `userId`+room per connection (auth context + `ConnectionLimitExtension`), so it could expose membership via an internal API the web app polls/subscribes. *Rejected* — introduces a new polling/subscription channel and custom aggregation when awareness already broadcasts exactly this; polling also fails the ≤3s/≤5s latency goals gracefully only with a tight interval (wasteful).

**Key consequence**: the presence room is **not** a document room — it has no `yjsStateId`, no document, no `CollaborationSession`. The collab server must treat it as a first-class, distinct room type (R2).

## R2 — Presence room as a first-class room type (collab server)

**Decision**: Adopt a reserved room-name shape for presence (e.g. `presence/<projectId>` — distinct from the document `"<projectId>/<yjsStateId>"` form) and branch the server lifecycle on it.

**Required server behavior for presence rooms**:
1. **`onRoomOpen`/`onRoomClose` session lifecycle**: SKIP. `parseRoomName` currently assumes `<projectId>/<yjsStateId>` and `findByYjsStateId` would fail → today `onConnect` would reject. Presence rooms must bypass the document-session callbacks entirely (no `CollaborationSession` row).
2. **`PersistenceExtension` (`onLoadDocument`/`onStoreDocument`)**: no-op for presence rooms (there is no Yjs document to load/store; calling `parseRoomName` would throw).
3. **`ConnectionLimitExtension`**: presence rooms must NOT consume a user's document connection/room budget — otherwise a user idling on a project with the tree open burns a room slot. Exempt presence rooms from the per-document caps (still keep a sane independent cap + the rate limit to prevent abuse).
4. **`beforeHandleMessage` max-payload guard**: still applies (awareness updates are tiny; the guard stays as a safety net).

**Rationale**: This generalizes "room" into {document room, presence room} with a clear discriminator, rather than scattering `if (isPresence)` special cases — the right altitude. The discriminator is the room-name prefix, parsed once.

**Alternatives considered**: Reuse a document room for presence (rejected — presence is cross-file, not per-document); encode presence as a magic `yjsStateId` (rejected — pollutes the document model and the DB lookups).

## R3 — Authorizing presence-room joins (security)

**Decision**: Extend the internal collab-auth endpoint (`apps/api/src/routes/internal/collab-auth.ts`) to authorize a presence room by **project membership**, via a thin new domain use-case `AuthorizeProjectPresenceUseCase(userId, projectId)` that reuses `ProjectMemberRepository.findByCompositeKey`. The auth hook (`auth-hook.ts`) detects the presence-room shape and calls auth accordingly; Origin allowlist (CSWSH) still applies.

**Verified access model** (resolves analyze findings C1/F1): the existing document path (`AuthorizeCollabConnectionUseCase`) authorizes a connection purely by **project membership** — `projectMemberRepo.findByCompositeKey(projectId, actorId)`; the file/document repos are used only to confirm the document belongs to the claimed project (anti-spoofing), NOT for per-file permissions. **There are no per-file ACLs: a project member can access every file in the project.** Two consequences:
- The reusable primitive is `ProjectMemberRepository.findByCompositeKey` — but `AuthorizeCollabConnectionUseCase` itself cannot be reused for presence because it requires a `yjsStateId` (a presence room has none). Hence a small, separate use-case is the right shape. It returns a boolean-style ok/deny (no collaboration role — presence is read-only).
- Because access is project-scoped, broadcasting every member's `openFileNodeId` to project members leaks nothing they could not already see (SC-005 holds with project-level auth — **no server-side per-file filtering is required**).

**Domain/Constitution note**: this adds ONE small use-case (no new entity, no new repository — it reuses `ProjectMemberRepository`). Per Constitution III it ships with an in-memory fake + unit test (member → ok, non-member → deny), test-first.

**Alternatives considered**: No auth on presence (rejected — leaks who is working where, and lets outsiders join); reusing `AuthorizeCollabConnectionUseCase` (rejected — it requires a `yjsStateId`/document a presence room does not have); server-side per-file filtering of the broadcast (unnecessary — the access model is project-level, confirmed above).

## R4 — Web client integration

**Decision**: New `useProjectPresence(projectId, user, currentOpenFileNodeId)` hook that:
- opens ONE `HocuspocusProvider` to `presence/<projectId>` (cookie auth, same as the document provider),
- publishes awareness `{ user: AwarenessUser, openFileNodeId: string | null }` (null when the viewer has no file open),
- returns a `Map<fileNodeId, PresenceParticipant[]>` of OTHER users per file (dedup by `userId`, exclude self — reusing the `collectParticipants` logic),
- is threaded into `file-tree.tsx`; `file-tree-node.tsx` renders a marker when its `node.id` is a key in the map, with a Radix Tooltip listing participants (reusing the `ParticipantChip` avatar/name/color visual).

The viewer's current open file comes from the existing `useFileSelection`/`useCollabDocument` flow in `project-editor-layout.tsx`, fed into the presence hook so the viewer also advertises what they have open (for everyone else's tree).

**Rationale**: Maximal reuse of `awareness-user.ts`, `use-collab-presence.ts` dedup, and `collab-presence-bar.tsx` visuals. Keying on `fileNodeId` matches the file-tree node id (the tree never has `yjsStateId`), so no translation is needed.

**Connection-cost note**: one persistent presence WS per open project tab. Acceptable given R2's cap exemption; if a deployment finds it costly, the fallback is to publish presence only while the editor pane is mounted (still covers the "others are editing" case).

## R5 — Identity, dedup, and the awareness state shape

**Decision**: Awareness local state for the presence room = `{ user: AwarenessUser, openFileNodeId: string | null }`. `AwarenessUser` (`{ userId, name, color, colorLight, avatarUrl? }`) is built by the existing `buildAwarenessUser` with `colorForUser` — identical to in-document presence, so colors/avatars match across the app. Dedup by `userId` (a user with two tabs on the same file appears once); exclude the local client.

**Rationale**: Consistency with the editor presence bar (same colors/avatars), and FR-009 multi-tab dedup reuses the proven `collectParticipants` approach.

## R6 — Liveness / no-stale (FR-007 / SC-004)

**Decision**: Rely on awareness's built-in liveness — when a client's WS drops (close, crash, network loss), the server removes that client's awareness entry and broadcasts the removal, so peers' trees clear within the awareness timeout (seconds). No custom heartbeat/watchdog needed for presence.

**Rationale**: This is awareness's core guarantee and the main reason to prefer R1-A over the DB approach (which would need per-user crash reconciliation). The existing orphaned-room watchdog is unrelated (it cleans document rooms); presence rooms self-clean.

## R7 — Scope: files vs folders, "open" definition

**Decision**: v1 marks **files** only; "open" = a user has the document open in the editor (publishes a non-null `openFileNodeId`). Folder roll-up (a folder badge when a descendant is open) is deferred. The viewer's own open file is excluded from "open by others."

**Rationale**: Matches the spec assumptions; folder aggregation is a pure client-side derivation that can be added later without protocol change.

## R8 — Test & gate strategy

**Decision**: Unit-test `useProjectPresence` and the marker/hover with a mocked awareness object (existing pattern); test the collab server presence-room branch (auth/persistence/limits skip) with mocked payloads + in-memory fakes; add a Playwright collab e2e (`collab-file-tree-presence.spec.ts`): two users, B opens a file, A sees the marker + correct name, B leaves → marker clears. All standard gates (lint, typecheck, fresh-onion, build, coverage 90/90/90/90 collab+web, audit, e2e).

**Rationale**: Mirrors how the existing collaboration features are verified; the e2e is the parity/liveness proof.

## Open risks (carried into tasks)

1. Presence-room auth must gate on project membership (the new `AuthorizeProjectPresenceUseCase`) — a mistake here is a presence leak (SC-005). Test-first with an in-memory fake. (Access model verified project-level, so project-membership auth is sufficient and no per-file filtering is needed.)
2. `ConnectionLimitExtension` exemption must not open a DoS hole — keep an independent presence cap + rate limit.
3. One persistent WS per open project tab — confirm acceptable; fallback in R4.
4. Awareness timeout tuning — confirm the default clears within the ≤5s SC-003 window; adjust if needed.
