# Data Model: File Tree UX Improvements

## Existing Entities (unchanged)

### FileTreeNode (types.ts)
No changes to the interface. Sorting is applied to `children` arrays at render time, not to the data shape.

```ts
interface FileTreeNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
  parentId: string | null;
  children: FileTreeNode[];
}
```

---

## New Client-Side State Shapes

### FindSession (managed by `useFindInTree`)

Transient UI state — not persisted, not shared across components.

```ts
interface FindSession {
  query: string;                    // Current search string (empty = inactive)
  matches: FindMatch[];             // Ordered list of all matching nodes
  currentIndex: number;             // Index into matches (-1 = none)
  preSearchExpandedIds: Set<string>; // Folder expand state snapshot before search
}

interface FindMatch {
  nodeId: string;
  nodePath: string;         // Used to locate ancestors for auto-expand
  ancestorIds: string[];    // All folder ancestors from root to parent (pre-computed)
}
```

### ExpandedState (lifted to FileTree)

Replaces the local `useState(false)` in `FileTreeNode`.

```ts
type ExpandedState = Map<string, boolean>; // nodeId → isExpanded
```

### FileOperationError (managed by FileTree)

```ts
type FileOperationError = string | null;
```

---

## Component Contract Changes

### FileTreeActions — new `onError` prop

```ts
interface FileTreeActionsProperties {
  // ... existing props ...
  onError: (message: string | null) => void; // replaces internal error state
}
```

### FileTreeNode — new expand control props + onError passthrough

```ts
interface FileTreeNodeProperties {
  // ... existing props ...
  isExpanded: boolean;                              // controlled from parent
  onToggle: (nodeId: string) => void;              // lift expand/collapse
  onError: (message: string | null) => void;       // passthrough to FileTreeActions
}
```

### FileTree — new state + props for find and error

```ts
// Internal state additions:
// - expandedState: ExpandedState
// - findSession: FindSession
// - operationError: FileOperationError
```
