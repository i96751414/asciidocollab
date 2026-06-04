# Implementation Plan: File Tree UX Improvements & Project Page Consistency

**Branch**: `013-file-tree-ux` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-file-tree-ux/spec.md`

## Summary

Improve the file tree component and project editor page with four targeted enhancements: alphabetical sorting of all tree nodes, a find-in-tree feature with keyboard navigation and auto-expand of collapsed ancestors, relocation of file operation errors to a panel-level error area outside tree rows, and a visual consistency pass over the project editor page layout.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, Next.js 16

**Primary Dependencies**: ShadCN/UI (Button, Input, DropdownMenu), Lucide React icons, Radix UI primitives, Jest + React Testing Library

**Storage**: N/A — all changes are purely client-side UI state

**Testing**: Jest + React Testing Library (unit), Playwright (e2e)

**Target Platform**: Web browser (Next.js app router, `'use client'` components)

**Project Type**: Web application frontend (Next.js)

**Performance Goals**: Find/sort operations complete synchronously for projects up to 500 nodes with no observable lag

**Constraints**: Must preserve all existing keyboard shortcut bindings; expand state lift must not break existing tests; no changes to API contracts

**Scale/Scope**: ~6 files modified, ~3 new files (hook, component, tests)

## Constitution Check

✅ **TDD (NON-NEGOTIABLE)**: Every new function and component change must be test-first. New hook `useFindInTree` and sort utility get unit tests before implementation. Updated prop contracts in `FileTreeNode` and `FileTreeActions` get tests updated before source changes.

✅ **Clean Code**: `sortChildren` is a pure function. `useFindInTree` has a single responsibility. `onError` callback follows existing callback naming conventions.

✅ **Seam Testing**: No new repository interfaces introduced. All changes are UI components tested with React Testing Library.

✅ **Layer boundaries**: All changes are in `apps/web/src/components/file-tree/` and `apps/web/src/app/(dashboard)/…`. No domain/infrastructure changes.

✅ **Quality Gates**: `pnpm --filter @asciidocollab/web lint`, `typecheck`, `test` must all pass after each phase.

## Project Structure

### Documentation (this feature)

```text
specs/013-file-tree-ux/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code affected

```text
apps/web/src/
├── components/file-tree/
│   ├── file-tree.tsx                    # MODIFY: sort, lifted expand state, error state, find integration
│   ├── file-tree-node.tsx               # MODIFY: controlled isExpanded/onToggle, onError passthrough
│   ├── file-tree-actions.tsx            # MODIFY: remove internal error state, add onError prop
│   └── find-panel.tsx                   # NEW: search input + match counter UI
│
├── hooks/
│   └── use-find-in-tree.ts             # NEW: find session state machine
│
└── app/(dashboard)/dashboard/projects/[id]/
    └── project-editor-layout.tsx        # MODIFY: visual consistency pass

apps/web/tests/
├── components/file-tree/
│   ├── file-tree.test.tsx               # MODIFY: add sort + find + error area tests
│   ├── file-tree-node.test.tsx          # MODIFY: update for controlled expand props
│   ├── file-tree-actions.test.tsx       # MODIFY: update for onError prop
│   └── find-panel.test.tsx              # NEW
│
├── hooks/
│   └── use-find-in-tree.test.tsx       # NEW (requires jsdom — .tsx extension)
│   └── use-file-tree-ui-state.test.tsx # NEW (extracted hook tests)
│
└── app/(dashboard)/
    └── projects/[id]/
        └── project-editor-layout.test.tsx   # MODIFY: add visual consistency assertions
```

## Phases

### Phase 1 — Alphabetical Sorting (self-contained, no new interfaces)

**Goal**: All tree levels render alphabetically. Existing tests must still pass.

**Approach**:

1. Add `sortChildren(node: FileTreeNode): FileTreeNode` pure helper in `file-tree.tsx` — recursively sorts each `children` array using `localeCompare` with `sensitivity: 'base'`.
2. Apply `sortChildren` to the fetched tree root in `fetchTree`.
3. Apply sort inside `applyEvent` after `created`, `renamed`, and `moved` mutations (only the affected parent's children need re-sorting).
4. Update `file-tree.test.tsx` with a test asserting alphabetical order after render and after a `created` SSE event.

**Files changed**: `file-tree.tsx`, `file-tree.test.tsx`

**TDD cycle**: Write failing test for alphabetical rendering → implement `sortChildren` → green → write test for sort-after-create event → implement in `applyEvent` → green.

---

### Phase 2 — Error Area Outside Tree Items

**Goal**: File operation errors appear in the panel header area; tree item rows are layout-stable.

**Approach**:

1. Add `onError: (message: string | null) => void` prop to `FileTreeActions`. Remove internal `error` state and the inline `<span>` error render.
2. Add `onError` passthrough prop to `FileTreeNode` (passes it to its `FileTreeActions` call).
3. In `FileTree`, add `operationError` state. Render error banner in the panel header area (between the "Files" label row and the tree content): `{operationError && <div role="alert" className="px-2 py-1 text-xs text-destructive border-b">{operationError}<button onClick={() => setOperationError(null)}>✕</button></div>}`.
4. Pass `onError={setOperationError}` down through `FileTreeNode` → `FileTreeActions`.
5. Update tests: `file-tree-actions.test.tsx` — verify `onError` called with message; `file-tree.test.tsx` — verify error banner appears outside tree rows; `file-tree-node.test.tsx` — verify onError prop is threaded through.

**Files changed**: `file-tree-actions.tsx`, `file-tree-node.tsx`, `file-tree.tsx`, corresponding test files.

**TDD cycle**: Update `file-tree-actions.test.tsx` to assert `onError` callback called → update component interface → green → add `file-tree.test.tsx` error banner test → implement banner in `FileTree` → green.

---

### Phase 3 — Find in Tree

**Goal**: A find panel with keyboard-driven match cycling, auto-expand of collapsed ancestors.

**Prerequisite**: Phase 1 (alphabetical sort) and Phase 2 (error area) complete — expand state lift happens in this phase and the error lift from Phase 2 cleans up `FileTreeActions`.

**Approach**:

**3a — Lift expand state from `FileTreeNode` to `FileTree`**

- Replace `const [isExpanded, setIsExpanded] = useState(false)` in `FileTreeNode` with controlled `isExpanded: boolean` prop + `onToggle: (nodeId: string) => void` prop.
- In `FileTree`, maintain `expandedState: Map<string, boolean>` in `useState`. Implement `toggleExpand(nodeId)` helper. Pass `isExpanded={expandedState.get(node.id) ?? false}` and `onToggle={toggleExpand}` to each `FileTreeNode`.
- The `DragDropZone` render for root children must thread `onToggle` and `isExpanded` through each recursive `FileTreeNode` call.
- Update `file-tree-node.test.tsx` to pass controlled props.

**3b — `useFindInTree` hook**

New file `apps/web/src/hooks/use-find-in-tree.ts`:

```ts
// Note: the canonical type is FileTreeNode (from './types'). Import as
// `FileTreeNodeType` only in files that also import the FileTreeNode component.
useFindInTree(tree: FileTreeNode | null, expandedState: Map<string, boolean>, setExpandedState: (state: Map<string, boolean>) => void): {
  query: string;
  setQuery: (q: string) => void;
  matchCount: number;
  currentMatchIndex: number; // 0-based, -1 if none
  nextMatch: () => void;
  prevMatch: () => void;
  dismiss: () => void;
  currentMatch: FileTreeNode | null; // the full node reference for the current match
}
```

> **Wiring note (V1)**: `FileTree` MUST pass a plain wrapper, not the raw React state setter, to avoid `Dispatch<SetStateAction<...>>` type parameter conflicts: `(s) => setExpandedState(s)`.

Internals:
- `buildMatchList(tree, query)`: DFS traversal collecting all nodes whose `name` contains `query` (case-insensitive). For each match, store the **full `FileTreeNode` reference** (not just ID) and pre-compute `ancestorIds` (parent chain up to root). The full node reference is needed to supply all four `onSelectFile` arguments (`id`, `name`, `path`, `type`) during match navigation.
- When `currentMatchIndex` changes, expand all `ancestorIds` of the new current match in `expandedState`.
- On `dismiss()`: restore `preSearchExpandedIds` snapshot to `expandedState`; clear query.
- **Coupling note (V3)**: The hook holds direct write access to the full `expandedState` map during an active find session. This is intentional — the hook owns the expand map while a search is active and restores it on dismiss. Document this with a short comment in the hook implementation.

**3c — `FindPanel` component**

New file `apps/web/src/components/file-tree/find-panel.tsx`:

```tsx
interface FindPanelProperties {
  query: string;
  onQueryChange: (q: string) => void;
  matchCount: number;
  currentMatchIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onDismiss: () => void;
}
```

Renders: text input, `↑`/`↓` buttons (Lucide `ChevronUp`/`ChevronDown`), match counter (`n of m`), dismiss button (Lucide `X`).

**3d — Wire into `FileTree`**

- Add find activation: Ctrl+F / Cmd+F within the `<div ref={containerReference}>` triggers find (via `onKeyDown` on the container).
- Show `FindPanel` between the "Files" label row and the error banner (if any).
- Pass `selectedNodeId` update: when `useFindInTree` selects a match, call `onSelectFile` with all four required arguments from the matched `FileTreeNode` — `(node.id, node.name, node.path, node.type)` — so the content panel loads the file. Use the `currentMatch: FileTreeNode | null` value returned by the hook.

**TDD cycle**:
- `use-find-in-tree.test.ts`: test match building, next/prev cycling, wrap-around, auto-expand, dismiss/restore — all before hook implementation.
- `find-panel.test.tsx`: render, user types query, buttons fire callbacks.
- Integration test in `file-tree.test.tsx`: Ctrl+F opens find panel, typing matches nodes.

---

### Phase 4 — Visual Consistency Pass

**Goal**: Project editor page looks cohesive; collapse buttons use Lucide icons.

**Approach**:

1. In `project-editor-layout.tsx`:
   - Replace `‹` unicode in collapse sidebar button → `<ChevronLeft className="h-4 w-4" />` with `<Button variant="ghost" size="icon">`.
   - Replace `›` unicode in expand sidebar button → `<ChevronRight className="h-4 w-4" />`.
   - Replace `‹` unicode in expand preview button → `<ChevronLeft className="h-4 w-4" />`.
   - Verify all header links use consistent `text-sm text-muted-foreground hover:text-foreground` class set.
   - Add `shrink-0` to the "Files" panel header row if not present; align vertical padding with `p-2` consistently.
   - Content panel: verify `p-4` padding consistent with design system.
   - Preview panel: if no file selected, review empty-state text styling.

2. Update `project-editor-layout.test.tsx` to assert Lucide icons render (`ChevronLeft`, `ChevronRight`) replacing the raw character assertions (if any).

**Files changed**: `project-editor-layout.tsx`, `project-editor-layout.test.tsx`

**TDD cycle**: Update test to assert presence of icon elements → implement icon replacements → green.

---

## Complexity Tracking

No constitution violations. All changes are in the delivery layer (`apps/web`). No new packages, no new domain entities, no infrastructure changes.
