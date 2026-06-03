# Contract: File Tree Operations

Routes for creating, deleting, renaming, and moving files and folders within a project.
All routes require an authenticated session and project membership.
All mutating operations emit a `FileTreeEventDto` to the project's SSE channel on success.

---

## POST `/projects/:projectId/files`

Creates a new file (AsciiDoc document) or folder in the project's file tree.

**Auth**: Session required; actor must be a project member.

**Request**:
```json
{
  "type": "file" | "folder",
  "name": "string",
  "parentId": "string (FileNode UUID of parent folder)"
}
```

**Response `201`**:
```json
{
  "fileNodeId": "string",
  "type": "file" | "folder",
  "name": "string",
  "path": "string"
}
```

**Errors**:
- `401` — not authenticated
- `403` — not a project member
- `404` — parent folder not found
- `409` — a file or folder already exists at that path (first-writer-wins conflict)
- `400` — validation error (invalid name)

---

## DELETE `/projects/:projectId/files/:fileNodeId`

Deletes a file or folder (and all its descendants) from the project.
Root folders cannot be deleted.

**Auth**: Session required; actor must be a project member.

**Response `204`**: deleted, no body.

**Errors**:
- `401` — not authenticated
- `403` — not a project member
- `404` — file node not found
- `400` — cannot delete the project root folder

---

## PATCH `/projects/:projectId/files/:fileNodeId`

Renames or moves a file or folder. At least one of `name` or `parentId` must be provided.

**Auth**: Session required; actor must be a project member.

**Request**:
```json
{
  "name": "string (optional — new name)",
  "parentId": "string (optional — new parent folder UUID)"
}
```

**Response `200`**:
```json
{
  "fileNodeId": "string",
  "name": "string",
  "path": "string",
  "parentId": "string | null"
}
```

**Errors**:
- `401` — not authenticated
- `403` — not a project member
- `404` — file node or new parent not found
- `409` — a file or folder already exists at the target path
- `400` — cannot rename/move the root folder; or no fields provided
