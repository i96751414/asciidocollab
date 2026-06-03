# Component Props Contracts

**Phase 1 output for `012-project-page-editor`**

These interfaces define the public API of each new or modified component. They are the contract between components and the layout, and between the server and client boundary.

---

## `ProjectEditorLayout` (new)

**File**: `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx`
**Type**: Client component (`'use client'`)

```typescript
interface ProjectEditorLayoutProps {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
  isOwner: boolean;  // from server-side getProjectAccess; controls file management visibility
}
```

**Responsibilities**:
- Renders the three-panel layout (collapsible file tree sidebar | content panel | preview panel)
- Calls `useFileSelection(projectId)` and owns all selection + content-fetch state
- Owns `sidebarOpen` state (React state; resets on page load)
- Owns `previewOpen` state (backed by `sessionStorage`)
- Passes `selectFile` as `onSelectFile` to `FileTree`; passes `contentState` to `FileContentPanel`; passes `contentState.content` to `AsciiDocPreview`

---

## `FileTree` (modified)

**File**: `apps/web/src/components/file-tree/file-tree.tsx`

```typescript
interface FileTreeProps {
  projectId: string;
  isOwner: boolean;            // NEW: controls visibility of file management actions
  onSelectFile: (           // NEW: called when a file node is clicked
    nodeId: string,
    nodeName: string,
    nodePath: string,
  ) => void;
  selectedNodeId: string | null;  // NEW: controlled selection for highlight
}
```

**Breaking changes**: `onSelectFile` replaces the internal `setSelectedNodeId` for external consumers. All selection state is now owned by the layout via `useFileSelection`.

---

## `FileTreeNode` (modified)

**File**: `apps/web/src/components/file-tree/file-tree-node.tsx`

```typescript
interface FileTreeNodeProps {
  node: FileTreeNode;
  depth: number;
  projectId: string;
  isOwner: boolean;            // NEW: prop-drilled from FileTree
  selectedNodeId: string | null;  // NEW: for active highlight
  onSelect: (nodeId: string, nodeName: string, nodePath: string) => void;
  onContextMenu: (event: React.MouseEvent, nodeId: string) => void;
}
```

---

## `FileTreeActions` (modified)

**File**: `apps/web/src/components/file-tree/file-tree-actions.tsx`

```typescript
interface FileTreeActionsProps {
  projectId: string;
  fileNodeId: string;
  parentId: string;
  nodeType: 'file' | 'folder';
  nodeName: string;
  hasChildren: boolean;  // NEW: true when deleting a non-empty folder → shows distinct warning
  onUpdate: () => void;  // unchanged — still called after each successful mutation
}
```

**Behavior changes**: All `window.prompt()` calls are replaced with Radix UI Dialog components. Delete uses `ConfirmationDialog` with a distinct "also delete all files inside" warning when `hasChildren` is true. Rename uses a Dialog with a controlled `<Input>`. Create file/folder uses a Dialog with an `<Input>`.

---

## `FileContentPanel` (new)

**File**: `apps/web/src/components/file-content-panel.tsx`
**Type**: Client component (`'use client'`)

**Design note**: Pure display component. `useFileSelection` is called in `ProjectEditorLayout` (not here). The layout passes all fetched state as props.

```typescript
interface FileContentPanelProps {
  selectedFile: SelectedFile | null;  // null = no selection (show placeholder)
  contentState: FileContentState;     // loading/content/error/binary state from useFileSelection
  // no projectId — this component never fetches
}
```

**Visual states**:
1. `selectedFile === null` → "Select a file from the tree to view its content."
2. `contentState.isLoading === true` → skeleton / loading spinner
3. `contentState.isBinary === true` → "Preview not available for binary files."
4. `contentState.error !== null` → error message
5. `contentState.content !== null` → `<pre>` block with raw text

---

## `AsciiDocPreview` (new)

**File**: `apps/web/src/components/asciidoc-preview.tsx`
**Type**: Client component (`'use client'`)

```typescript
interface AsciiDocPreviewProps {
  content: string;       // raw AsciiDoc source text
  isOpen: boolean;       // controlled by parent layout
  onToggle: () => void;  // parent toggles the open state
}
```

**Visual states**:
1. `isOpen === false` → collapsed strip showing toggle button only
2. `isOpen === true`, rendering → spinner
3. `isOpen === true`, rendered → `dangerouslySetInnerHTML` with sanitized HTML output

**Security note**: `asciidoctor.convert()` output may contain arbitrary HTML. The preview panel renders inside a sandboxed visual region; any user-facing content stored in the project is already controlled by the project owner so XSS risk is equivalent to document editing. A future security hardening task may add DOMPurify.
