# Phase 1 Data Model: Persist & Restore File Selection

This feature introduces **no database entities and no shared DTOs**. The only persisted data is a client-side `localStorage` record. It is modeled here as a TypeScript shape owned by `apps/web`.

---

## Entity: `LastSelection` (client-side, per project)

Represents the most recent file selection (and AsciiDoc cursor line) for one project, scoped to the current **user** on the current browser.

### Storage location

- **Medium**: browser `localStorage`
- **Key**: `asciidocollab:last-selection:${userId}:${projectId}` (one entry per user per project)
- **Value**: JSON-serialized `LastSelection`

The key is scoped by `userId` (the authenticated user's id, available server-side via `/auth/me` and passed into the layout) so that two accounts sharing the same browser profile never see each other's selection — satisfying FR-011. The `userId` is part of the key, not the stored value.

### Fields

| Field      | Type                  | Required | Description |
|------------|-----------------------|----------|-------------|
| `nodeId`   | `string`              | yes      | Stable identifier of the selected file node (matches `SelectedFile.nodeId`). The key used to re-select and to fetch content. |
| `nodeName` | `string`              | yes      | Display name; lets the tree/editor render immediately on restore and decides AsciiDoc vs other via `isAsciiDocFile(nodeName)`. |
| `nodeType` | `'file' \| 'folder'`  | yes      | Always `'file'` in practice (only content files are remembered — see validation). Kept for parity with `SelectedFile`. |
| `path`     | `string`              | yes      | Absolute path within the project; passed through to `selectFile` for include/image resolution. |
| `line`     | `number` (1-based)    | no       | Last cursor line, persisted only for AsciiDoc files. Absent for non-AsciiDoc files and when never focused. |

> Shape intentionally aligns with the existing `SelectedFile` interface (`apps/web/src/hooks/use-file-selection.ts`) plus the optional `line`, so restoration can call `selectFile(nodeId, nodeName, path, nodeType)` directly.

### Validation rules (applied on read — untrusted storage)

1. The parsed value MUST be a non-null, non-array object; otherwise treat as **no memory** (return `null`).
2. `nodeId`, `nodeName`, `path` MUST be non-empty strings; `nodeType` MUST be `'file'` or `'folder'`. Any failure ⇒ **no memory**.
3. `line`, if present, MUST be a finite number `>= 1`; otherwise the field is dropped (treated as absent), not fatal.
4. On restore, the referenced node's existence is confirmed by the content fetch (Decision 5). A non-OK response ⇒ delete the entry and fall back to no selection.
5. `line` is **clamped** at apply-time to `[1, currentDocumentLineCount]` ("closest valid line"); the stored value itself is never rewritten by clamping.

### Lifecycle / state transitions

| Trigger | Effect on the `localStorage` entry |
|---------|------------------------------------|
| User selects a content file | Write `{ nodeId, nodeName, nodeType, path }` (drop any previous `line`). |
| User moves the cursor in an AsciiDoc file (debounced) | Merge `line` into the current entry. |
| User selects a non-AsciiDoc file | Entry has no `line`. |
| Restore finds the file missing (content fetch not OK) | Delete the entry. |
| User selects a folder | No write (folders are not remembered). |
| `localStorage` unavailable / throws | No-op; feature silently inert (no crash). |

### Cardinality

- At most **one** entry per (`userId`, `projectId`) per browser profile. Writing overwrites the prior value (last-write-wins). Projects are independent (separate keys) — satisfies FR-003; users are independent (separate keys) — satisfies FR-011.

### Non-goals (explicitly not stored)

- Cursor column, selection ranges, scroll offset within a line, fold state, undo history.
- Cross-device / cross-browser synchronization (would require the server-backed variant from research Decision 1).
- History of past selections (only the latest is kept).
