# Contract: File Tree Events (SSE)

Real-time Server-Sent Events stream for file tree structural changes within a project.
Clients subscribe once and receive incremental updates for the lifetime of the connection.

---

## GET `/projects/:projectId/events`

Opens a Server-Sent Events stream for the project's file tree changes.

**Auth**: Session required; actor must be a project member.

**Response headers**:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Stream format**: Each event is emitted as:
```
data: <JSON payload>\n\n
```

**Event payload** (`FileTreeEventDto`):
```json
{
  "type": "created" | "deleted" | "renamed" | "moved",
  "fileNodeId": "string (UUID)",
  "nodeType": "file" | "folder",
  "name": "string (current name after operation)",
  "path": "string (current full path after operation)",
  "parentId": "string | null (current parent folder UUID after operation)"
}
```

**Event types**:
- `created` — a file or folder was added to the project tree
- `deleted` — a file or folder (and its subtree) was removed
- `renamed` — a file or folder was renamed in place (same parent)
- `moved` — a file or folder was moved to a different parent folder

**Connection lifecycle**:
- The server emits a keepalive comment (`: keepalive`) every 30 seconds to prevent proxy timeouts.
- When the client closes the connection, the server removes the listener.
- Clients should reconnect on unexpected disconnection and call `GET /projects/:id/files` to reconcile state.

**Browser connection sharing**:
Browsers enforce a per-origin limit on concurrent HTTP/1.1 connections (typically 6), and each SSE stream counts against this budget. Clients MUST use a `SharedWorker` to hold a single SSE connection per project across all tabs from the same browser. The `SharedWorker` opens one `EventSource` to this endpoint and forwards events to each tab via `MessagePort`. See `quickstart.md` for the reference implementation.

**Errors** (before stream opens):
- `401` — not authenticated
- `403` — not a project member
- `404` — project not found
