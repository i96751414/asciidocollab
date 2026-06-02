# Contract: File Asset Upload and Retrieval

Routes for uploading and retrieving any binary file asset within a project (images, CSVs, PDFs, AsciiDoc includes, etc.).
All routes require an authenticated session and project membership.

> **Note on naming**: The underlying API route path uses `/images` to match the existing `Image` domain entity (already implemented in a previous phase). The endpoint accepts any file type — the "images" path is a historical artifact, not a restriction.

---

## POST `/projects/:projectId/images`

Uploads a file of any type to the project at the specified parent folder location. Emits a `FileTreeEventDto` (`type: 'created'`) on success.

**Auth**: Session required; actor must be a project member.

**Request**: `multipart/form-data`
- `file` — the file content (binary)
- `parentId` — UUID of the parent folder node
- `filename` — original filename (used as the on-disk name and displayed in the file tree)

**Constraints**:
- **Any MIME type is accepted** — the system does not restrict by file type
- Maximum file size: the active limit is the admin-configured value from `PATCH /admin/settings` (`maxUploadSizeBytes`), falling back to the `ASCIIDOCOLLAB_STORAGE_MAX_UPLOAD_BYTES` env var (default 20 MB). The rejection response (`413`) MUST NOT include the current limit value.

**Response `201`**:
```json
{
  "assetId": "string",
  "filename": "string",
  "storagePath": "string",
  "sizeBytes": 0,
  "mimeType": "string"
}
```

**Errors**:
- `401` — not authenticated
- `403` — not a project member
- `404` — parent folder not found
- `409` — a file already exists at that path
- `413` — file size exceeds the configured limit

---

## GET `/projects/:projectId/images/:assetId`

Retrieves the raw bytes of an uploaded file asset.

**Auth**: Session required; actor must be a project member.

**Path params**:
- `projectId` — project UUID
- `assetId` — asset UUID (the `Image.id` from the domain)

**Response `200`**:
```
Content-Type: <MIME type recorded at upload time>
Content-Disposition: inline; filename="<original filename>"
Body: raw file bytes
```

**Errors**:
- `401` — not authenticated
- `403` — not a project member
- `404` — asset not found, or file missing from storage
