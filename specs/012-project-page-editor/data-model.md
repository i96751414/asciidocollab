# Data Model: Project Page Editor

**Phase 1 output for `012-project-page-editor`**

This feature introduces no new database schema. All entities are frontend state shapes and prop interfaces managed within `apps/web`.

---

## Existing Domain Entities (referenced, not modified)

### FileNode (backend / domain)

Defined in `packages/domain/src/entities/file-node.ts` and exposed via the file-tree API.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` (UUID) | Primary key |
| `name` | `string` | Display name (file or folder) |
| `type` | `'file' \| 'folder'` | Node type |
| `path` | `string` | Absolute path within the project |
| `parentId` | `string \| null` | Parent folder ID; null for root |
| `children` | `FileNode[]` | Direct children (populated for folders) |

Frontend type: `apps/web/src/components/file-tree/types.ts` → `FileTreeNode` (identical shape, no changes needed).

---

## New Frontend State Shapes

### SelectedFile

Managed by the new `useFileSelection` hook. Represents which file node is currently active in the editor layout.

```typescript
interface SelectedFile {
  nodeId: string;
  nodeName: string;
  nodeType: 'file' | 'folder';
  path: string;
}
```

**State transitions**:
```
null ──(click file)──> SelectedFile
SelectedFile ──(click different file)──> SelectedFile (updated)
SelectedFile ──(selected file deleted)──> null
```

**Validation rules**:
- Only `type === 'file'` nodes trigger content fetching; clicking a folder updates selection but does not fetch content.

---

### FileContentState

Managed within `useFileSelection`. Tracks the loading/loaded/error state of the currently selected file's content.

```typescript
interface FileContentState {
  content: string | null;     // raw file text, null when loading or error
  isLoading: boolean;
  error: string | null;
  isBinary: boolean;          // true when Content-Type is not text/*
}
```

**State transitions**:
```
{ content: null, isLoading: false, error: null, isBinary: false }   ← initial
  ──(file selected)──>
{ content: null, isLoading: true, error: null, isBinary: false }    ← fetching
  ──(fetch ok, text/*)──>
{ content: "<raw text>", isLoading: false, error: null, isBinary: false }
  ──(fetch ok, binary)──>
{ content: null, isLoading: false, error: null, isBinary: true }
  ──(fetch error)──>
{ content: null, isLoading: false, error: "...", isBinary: false }
```

---

### PreviewPanelState

Persisted in `sessionStorage` under the key `asciidoc-preview-open`. Managed by local `useState` in `ProjectEditorLayout`.

```typescript
type PreviewPanelState = boolean; // true = open, false = collapsed
```

**Initial value**: Read from `sessionStorage` on mount; defaults to `false` if not set.

**Write**: Every toggle writes back to `sessionStorage`.

---

### FileManagementDialogState

Local state within the `FileTreeActions` component (or a sibling dialog component). Controls which dialog is shown.

```typescript
type DialogKind =
  | { type: 'rename'; nodeId: string; currentName: string }
  | { type: 'delete'; nodeId: string; nodeName: string; nodeType: 'file' | 'folder' }
  | { type: 'create-file'; parentId: string }
  | { type: 'create-folder'; parentId: string }
  | null;
```

**State transitions**:
```
null ──(user clicks menu item)──> { type, ... }
{ type, ... } ──(confirm)──> null (API call dispatched)
{ type, ... } ──(cancel / Escape)──> null
```

---

## AsciiDoc Detection Logic

Not a data entity — a pure function that accepts a `nodeName: string` and returns `boolean`.

```typescript
const ASCIIDOC_EXTENSIONS = new Set(['.adoc', '.asciidoc', '.asc']);

function isAsciiDocFile(nodeName: string): boolean {
  const ext = nodeName.slice(nodeName.lastIndexOf('.')).toLowerCase();
  return ASCIIDOC_EXTENSIONS.has(ext);
}
```

Lives adjacent to `AsciiDocPreview` component.
