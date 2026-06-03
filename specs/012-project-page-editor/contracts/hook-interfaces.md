# Hook Interfaces Contract

**Phase 1 output for `012-project-page-editor`**

---

## `useFileSelection` (new)

**File**: `apps/web/src/hooks/use-file-selection.ts`
**Type**: Custom React hook (client-side only)

**Caller**: `ProjectEditorLayout` — called once at the layout level. Neither `FileContentPanel` nor `AsciiDocPreview` call this hook; they receive its return values as props.

### Signature

```typescript
interface SelectedFile {
  nodeId: string;
  nodeName: string;
  nodeType: 'file' | 'folder';
  path: string;
}

interface FileContentState {
  content: string | null;
  isLoading: boolean;
  error: string | null;
  isBinary: boolean;
}

interface UseFileSelectionReturn {
  selectedFile: SelectedFile | null;
  contentState: FileContentState;
  selectFile: (nodeId: string, nodeName: string, nodePath: string, nodeType?: 'file' | 'folder') => void;
  clearSelection: () => void;
}

function useFileSelection(projectId: string): UseFileSelectionReturn
```

### Behaviour

1. `selectFile(nodeId, nodeName, nodePath, nodeType)` updates `selectedFile` and, if `nodeType === 'file'`, triggers a `fetch` to `GET /projects/:projectId/files/:nodeId/content`.
2. During the fetch, `contentState.isLoading === true`.
3. On success with `Content-Type: text/*`, `contentState.content` is set to the response text.
4. On success with a non-text `Content-Type`, `contentState.isBinary === true`.
5. On any network or HTTP error, `contentState.error` is set to the error message.
6. `clearSelection()` resets both `selectedFile` and `contentState` to their initial values.
7. If a new `selectFile` call arrives while a fetch is in-flight, the in-flight fetch is aborted (via `AbortController`) and the new fetch begins.

### Dependencies

- `getDocumentContent` from `apps/web/src/lib/api/file-content.ts` — used for text content fetching
- Native `fetch` for binary detection (inspecting `Content-Type` header before body parsing)

### Test surface

Unit tests in `apps/web/tests/hooks/use-file-selection.test.ts` cover:
- Selecting a file triggers content fetch
- Content is stored on success
- Binary files set `isBinary` flag
- Errors are captured in `error`
- Selecting a second file aborts the first fetch
- `clearSelection` resets state

---

## Existing hooks (referenced, not modified)

### `useFileTreeEvents`

**File**: `apps/web/src/hooks/use-file-tree-events.ts`

Used as-is by `FileTree`. Provides real-time SSE updates. No changes needed for this feature.

### `useKeyBindings` / `useFileTreeKeyHandler`

**File**: `apps/web/src/hooks/use-key-bindings.ts`, `apps/web/src/hooks/use-file-tree-key-handler.ts`

Used as-is by `FileTree`. Keyboard shortcut routing. When inline rename is active, the key handler must not intercept keystrokes — the `FileTree` will need to know when an inline edit is in progress and suppress key handling accordingly.
