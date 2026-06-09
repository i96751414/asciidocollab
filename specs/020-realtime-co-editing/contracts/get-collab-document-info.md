# Contract: GET collaboration document info

**Endpoint**: `GET /projects/:projectId/files/:fileNodeId/collab`

**Purpose**: Give the web editor the room identifier (`yjsStateId`) and the requesting user's collaboration role, so it can connect to the correct collaboration room and gate editability. Resolves review finding **B1** (room id) and **H3** (role signal).

**Auth**: Authenticated session (cookie). Same membership rules as `GET /content`.

**Path params**:
- `projectId` — UUID.
- `fileNodeId` — UUID.

## Responses

### 200 OK
```json
{
  "yjsStateId": "0f2a…-uuid",
  "role": "editor"
}
```
- `role`: `"editor"` | `"observer"` (`viewer` project members map to `observer`).
- `yjsStateId`: combine as `` `${projectId}/${yjsStateId}` `` to form the collaboration room name.

### 401 Unauthorized
No active session.

### 403 Forbidden
Authenticated user is not a member of the project.
```json
{ "error": { "code": "FORBIDDEN", "message": "Not a member of this project" } }
```

### 404 Not Found
File node does not exist, or the file is not a collaborative document (e.g., a binary asset with no `Document` record). The client treats 404 as "use the legacy/non-collab path."
```json
{ "error": { "code": "NOT_FOUND", "message": "No collaborative document for this file" } }
```

## Notes
- **Read-only**, idempotent; no side effects (does not open a room or create a session).
- Reuses the same checks as `GET /internal/collab/auth` (membership + document-ownership + role mapping) but is **client-facing** and keyed by `fileNodeId` (the client does not yet know `yjsStateId`), whereas the internal route is keyed by the room name.
- Route handler delegates entirely to `GetDocumentCollabInfoUseCase` (no business logic in the handler — Architecture Constitution P0 rule 2).
- Fastify schema validates path params; domain layer does not trust inputs.

## Test expectations (TDD)
- Domain (`get-document-collab-info.test.ts`, in-memory fakes):
  - editor member + text document → `{ yjsStateId, role: 'editor' }`.
  - viewer member + text document → `role: 'observer'`.
  - non-member → membership error.
  - file is an asset / no Document → `ContentNotFoundError`.
- API (`file-collab-info.test.ts`, integration):
  - 200 shape + role mapping; 401 unauth; 403 non-member; 404 asset/unknown node.
