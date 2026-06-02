# Contract: File Content

Routes for reading and writing the raw content of an AsciiDoc document.
All routes require an authenticated session and project membership.

---

## GET `/projects/:projectId/files/:fileNodeId/content`

Retrieves the raw AsciiDoc content of a document.

**Auth**: Session required; actor must be a project member.

**Path params**:
- `projectId` — project UUID
- `fileNodeId` — file node UUID (must be a `file` type node with an associated `Document`)

**Response `200`**:
```
Content-Type: text/plain; charset=utf-8
Body: raw AsciiDoc text
```

**Errors**:
- `401` — not authenticated
- `403` — not a project member
- `404` — file node not found, or file type is `folder`, or content file missing

---

## PUT `/projects/:projectId/files/:fileNodeId/content`

Atomically saves the updated AsciiDoc content of a document.

**Auth**: Session required; actor must be a project member.

**Path params**: same as GET above.

**Request**:
```
Content-Type: text/plain; charset=utf-8
Body: updated AsciiDoc text
```

**Response `204`**: content saved, no body.

**Errors**:
- `401` — not authenticated
- `403` — not a project member
- `404` — file node not found
- `400` — file node is a folder, not a file
