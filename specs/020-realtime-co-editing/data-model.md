# Phase 1 Data Model: Real-time Co-editing (Editor Integration)

This feature adds **no persistent entities** and **no schema migration**. It reuses existing records and introduces one cross-boundary DTO plus client-side view models.

## Reused persistent entities (no change)

### Document (`packages/db/prisma/schema.prisma`)
- `fileNodeId` (unique) — the file this document backs.
- `contentId` — immutable snapshot id; surfaced today as the `GET /content` ETag.
- `yjsStateId` — id of the mutable collaborative Yjs state; **now exposed to the client** as the room identifier component.
- `mimeType`.
- Invariant (existing): `contentId !== yjsStateId`.

### CollaborationSession
- `(projectId, documentId)` unique; existence == "room is active." Drives the `GET/PUT /content` 409 lock (018 FR-011). The client never reads this directly.

### ProjectMember
- `role` ∈ {owner, editor, viewer, …}. Maps to collab role: `viewer → observer`, everything else → `editor` (same mapping as `internal/collab-auth.ts`).

## New DTO (cross-boundary → `packages/shared/src/dtos/collab.dto.ts`)

```ts
// Reuses the existing CollabAuthRole = 'editor' | 'observer'

/** Response of GET /projects/:projectId/files/:fileNodeId/collab. */
export interface CollabDocumentInfo {
  /** Yjs state id; combined with projectId to form the room name `${projectId}/${yjsStateId}`. */
  yjsStateId: string;
  /** Collaboration role of the requesting user for this document. */
  role: CollabAuthRole;
}
```

Validation / rules:
- Returned only for files backed by a `Document` (text). Binary assets → 404 (no collaborative document).
- `role` derived server-side from `ProjectMember.role`; never trusted from the client.

## Domain use case (new) — `GetDocumentCollabInfoUseCase`

`packages/domain/src/use-cases/content/get-document-collab-info.ts`

- **Inputs**: `actorId: UserId`, `projectId: ProjectId`, `fileNodeId: FileNodeId`.
- **Dependencies (existing ports, existing in-memory fakes)**: `ProjectMemberRepository`, `FileNodeRepository`, `DocumentRepository`.
- **Returns**: `Result<CollabDocumentInfo, DomainError>`.
- **Logic**:
  1. Require membership + file node (reuses `requireMemberAndFileNode`, as `GetFileNodeContentUseCase` does).
  2. `documentRepo.findByFileNodeId(fileNodeId)` → if none, `ContentNotFoundError` (asset/no doc → 404).
  3. Map member role: `viewer → 'observer'`, else `'editor'`.
  4. Return `{ yjsStateId: document.yjsStateId.value, role }`.
- No infrastructure concerns; pure orchestration over ports (Architecture Constitution).

## Client-side view models (`apps/web`, not persisted)

### ConnectionState (discriminated)
- `connecting` — provider opened, not yet synced.
- `synced` — connected and initial sync complete; editor interactive (subject to role).
- `reconnecting` — dropped, provider retrying; edits buffered locally by Yjs.
- `offline` — could not reach the server at open; read-only fallback from `GET /content`.

Drives the editor banner (FR-014) and read-only gating (FR-013).

### ParticipantPresence (from Yjs awareness `user` field; see contracts/collab-awareness-user.md)
- `clientId` (Yjs awareness client id), `name`, `color`, `colorLight`, `avatarUrl?`, `cursor`/`selection` (rendered by y-codemirror).
- The local client's own entry is excluded from the presence bar and never rendered as an overlay (FR-008).

### EditorMode (derived, not stored)
- `collab-editor` | `collab-observer` | `offline-readonly` | `legacy-asset`.
- Pure function of `(getCollabDocumentInfo result, ConnectionState)` — see research D6.
