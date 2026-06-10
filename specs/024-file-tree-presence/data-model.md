# Phase 1 Data Model: File-Tree Open-File Presence

Presence is **ephemeral** and server-mediated via Yjs awareness. There is **no database schema change, no new persisted entity, and no audit record**. The "data model" here is the in-memory awareness state shape and its derived view.

## Ephemeral entities (awareness, in-memory only)

### PresenceLocalState (published by each client into the presence room)
- `user: AwarenessUser` — reused verbatim from `apps/web/src/lib/collab/awareness-user.ts`:
  - `userId: string` (stable app user id — the dedup key)
  - `name: string` (display name)
  - `color: string`, `colorLight: string` (deterministic from `userId` via `colorForUser`)
  - `avatarUrl?: string`
- `openFileNodeId: string | null` — the file the viewer currently has open in the editor, or `null` when none. Keyed to the **file-tree node id** (`fileNodeId`), which the tree already has.

### PresenceParticipant (derived, per file, for the UI)
The presence hook reduces all peers' awareness states into:
- `Map<fileNodeId, PresenceParticipant[]>` where `PresenceParticipant` is the existing `ParticipantPresence` shape (`{ userId, name, color, colorLight, avatarUrl? }`).

## Derivation rules (validation/invariants)

- **Exclude self**: the local client's own state is omitted (the marker reflects *other* users — FR-003).
- **Dedup by `userId`**: multiple tabs/devices of one user collapse to a single participant (FR-009).
- **Only non-null `openFileNodeId`**: a client with no file open contributes to no file's list.
- **Access scoping**: the map is only consulted for files the tree already renders (which the API already access-filters), so presence cannot reveal files the viewer cannot see (FR-008). The presence room itself is access-gated at join time by project membership (research R3).
- **Liveness**: a participant disappears from every list within the awareness timeout after their connection drops (FR-007 / SC-004) — guaranteed by awareness, not by application code.

## Relationship to existing models (unchanged)

- `CollaborationSession` (Prisma): **untouched** — it continues to track document rooms for the FR-011 edit lock; presence does not read or write it.
- `Document` / `FileNode`: unchanged. Presence keys on `fileNodeId` directly, so no `documentId`/`yjsStateId` lookup is involved on the presence path.

## State transitions (ephemeral)

`viewer opens file X` → publish `openFileNodeId = X` → peers' trees mark X within ≤3s.
`viewer switches to file Y` → publish `openFileNodeId = Y` → X clears (if no other holder), Y marks.
`viewer closes editor / disconnects` → state set null / auto-removed → all of the viewer's marks clear within the liveness window.

**Conclusion**: no schema, no migration, no audit. The only "model" is the awareness payload (`{ user, openFileNodeId }`) and the per-file derivation, both of which reuse existing types.
