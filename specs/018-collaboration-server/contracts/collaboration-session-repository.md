# Contract: CollaborationSessionRepository Port

**Package**: `packages/domain/src/ports/project/collaboration-session.repository.ts`
**Consumers**: `SaveDocumentContentUseCase`, `DeleteFileUseCase`, `OpenCollaborationSessionUseCase`, `CloseCollaborationSessionUseCase`, `apps/collab` composition root
**Implementations**: `PrismaCollaborationSessionRepository` (`packages/infrastructure/src/persistence/project/`), `InMemoryCollaborationSessionRepository` (`packages/domain/tests/ports/project/`)

---

## Interface

```typescript
import { ProjectId } from '../../value-objects/project-id';
import { DocumentId } from '../../value-objects/document-id';

export interface CollaborationSessionRepository {
  isActive(projectId: ProjectId, documentId: DocumentId): Promise<boolean>;
  open(projectId: ProjectId, documentId: DocumentId): Promise<void>;
  close(projectId: ProjectId, documentId: DocumentId): Promise<void>;
  closeAllForProject(projectId: ProjectId): Promise<void>;
  closeAll(): Promise<void>;
}
```

---

## Method Contracts

### `isActive(projectId, documentId): Promise<boolean>`

- Returns `true` if a `CollaborationSession` record exists for `(projectId, documentId)`.
- Returns `false` if no record exists or if the record is stale (no staleness check in Phase 8 — records are cleaned up on `apps/collab` startup).
- MUST NOT throw for not-found; returns `false` instead.

### `open(projectId, documentId): Promise<void>`

- Upserts a `CollaborationSession` record.
- Calling `open` twice for the same `(projectId, documentId)` is idempotent.

### `close(projectId, documentId): Promise<void>`

- Deletes the `CollaborationSession` record for `(projectId, documentId)`.
- No-op if no record exists.

### `closeAllForProject(projectId): Promise<void>`

- Deletes all `CollaborationSession` records where `projectId` matches.
- Used when a project is deleted.

### `closeAll(): Promise<void>`

- Deletes ALL `CollaborationSession` records.
- Called once at `apps/collab` startup to clear stale records from a previous unclean shutdown.

---

## In-Memory Fake Behaviour

The `InMemoryCollaborationSessionRepository` MUST:
- Maintain a `Set<string>` keyed by `${projectId.value}:${documentId.value}`.
- `open` adds to the set; `close` removes; `isActive` checks membership.
- `closeAll` clears the entire set.
- Never throw for any operation.
