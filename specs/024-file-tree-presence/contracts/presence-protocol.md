# Contract: Project Presence Protocol & Marker UI

Defines the new interfaces this feature introduces. Everything else (document rooms, the edit lock, the editor presence bar) is unchanged.

## 1. Presence room (WebSocket / Hocuspocus)

- **Room name**: `presence/<projectId>` — a reserved shape distinct from the document room `"<projectId>/<yjsStateId>"`. The collab server discriminates on this prefix.
- **Lifecycle (server)** for a presence room:
  - **Auth**: REQUIRED. The auth hook authorizes the join by **project membership** (the user can access `<projectId>`); Origin allowlist (CSWSH) still enforced. Unauthorized → close 1008.
  - **No document-session callbacks**: `onRoomOpen`/`onRoomClose` are NOT invoked; **no `CollaborationSession` row** is created.
  - **No persistence**: `onLoadDocument`/`onStoreDocument` are no-ops (there is no Yjs document/`yjsStateId`).
  - **Connection limits**: exempt from the per-document connection/room caps; an independent presence cap + the connect-rate limit still apply.
  - **Max-payload guard**: still enforced.
- **Wire content**: awareness only. No shared document updates are expected; document content MUST NOT flow through this room (FR-011).

## 2. Awareness state (client → room)

Each client sets its local awareness state:

```jsonc
{
  "user": {                      // AwarenessUser (reused, identical to in-editor presence)
    "userId": "…",
    "name": "…",
    "color": "#rrggbb",
    "colorLight": "#rrggbb",
    "avatarUrl": "…"             // optional
  },
  "openFileNodeId": "<fileNodeId>" | null   // the file this client currently has open, or null
}
```

- Set on connect/sync; updated on file switch; set to `null` (or cleared) when no file is open; auto-removed by awareness on disconnect.

## 3. Derived view (room → file tree)

`useProjectPresence(projectId, user, currentOpenFileNodeId)` returns:

```ts
Map<fileNodeId, PresenceParticipant[]>   // OTHER users per file
// PresenceParticipant = { userId, name, color, colorLight, avatarUrl? }  (existing ParticipantPresence)
```

Rules: exclude the local client; dedup by `userId`; include a file only if ≥1 other user publishes that `openFileNodeId`.

## 4. Internal auth endpoint (API)

`GET /internal/collab/auth?documentName=presence/<projectId>` (existing endpoint, extended):
- Detect the `presence/<projectId>` shape.
- Authorize by project access (reuse the existing project-access authorization used by the document path).
- Authorized → 200 with a presence-appropriate body (no document `role` required; e.g. `{ ok: true, userId }`). Unauthorized/forbidden → non-200 → connection rejected.
- MUST NOT grant presence for a project the user cannot access (SC-005).

## 5. Marker + hover UI (file tree)

- **Marker**: a file node whose `node.id` is a key in the presence map shows an "open by others" indicator (e.g. a small avatar/dot cluster), using design tokens, legible in light/dark, keyboard-focusable, with an accessible label (FR-010).
- **Hover/focus**: a Radix Tooltip (same primitive as `editor-toolbar-button.tsx`) lists the participants reusing the `ParticipantChip` visual (avatar or colored initial + name). Long lists show a bounded overflow ("+N more") (FR-005).
- **No marker** when the only holder is the viewer themselves (FR-003) or when no other user has the file open (FR-002).

## Acceptance

Conformance is shown by: unit tests of `useProjectPresence` + the marker/hover (mocked awareness), collab-server tests for the presence-room branch (auth/persistence/limits), and a Playwright e2e (`collab-file-tree-presence.spec.ts`) proving marker appearance, correct who-on-hover, and clearing on leave — plus the full quality-gate run, with no change to document content or the editor.
