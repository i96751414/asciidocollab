# Research: File Tree UX Improvements & Project Page Consistency

## Decision 1: Alphabetical sort location

**Decision**: Sort is applied purely client-side by transforming `children` arrays before rendering — both on initial fetch and after every `applyEvent` mutation.

**Rationale**: The API returns nodes in arbitrary insertion order; sorting on the client keeps the server contract stable. A `sortChildren` helper (recursive, case-insensitive `localeCompare`) is applied once on the fetched tree root and re-applied inside `applyEvent` for created/renamed/moved events.

**Alternatives considered**: Server-side sorting via query param — rejected because it adds a round-trip dependency and the tree data is already in memory.

---

## Decision 2: Find/search architecture

**Decision**: Introduce a `useFindInTree` hook that owns query state, match list, current index, and a snapshot of which folders were expanded before the search. The hook returns helpers (`nextMatch`, `prevMatch`, `dismissFind`). A `FindPanel` sub-component renders the search input and match counter inside the file tree panel. Expand/collapse state is lifted from `FileTreeNode` local `useState` to a `Map<id, boolean>` in `FileTree`, passed down as a controlled prop (`isExpanded`) + `onToggle` handler, so the hook can programmatically expand ancestor folders.

**Rationale**: Lifting expand state is required for auto-expand on match navigation. A dedicated hook keeps `FileTree` lean and makes the find logic independently testable. The find feature works purely on the in-memory tree — no server round-trips.

**Alternatives considered**: Keeping expand state local to `FileTreeNode` and using a ref-based imperative API — rejected because it leaks DOM concerns into the data layer and is harder to test.

---

## Decision 3: Error display architecture

**Decision**: Add an `onError: (message: string | null) => void` callback prop to `FileTreeActions`. `FileTree` owns an `operationError` state string and passes `onError` down through `FileTreeNode`. The error renders in the file tree panel header area (between the "Files" label row and the tree content), inside a dismissible `<div>` with `text-destructive` styling. The inline `{error && <span>}` in `FileTreeActions` is removed.

**Rationale**: The error is already co-located in `FileTreeActions` but renders inside the flex row of `FileTreeNode`, which distorts tree row height. Lifting it to `FileTree` centralises all error display and leaves tree item rows layout-stable.

**Alternatives considered**: Global toast system — rejected because the spec explicitly scopes errors to the file tree panel. Separate error component per dialog — rejected because errors appear after dialog close and must be visible outside the tree items.

---

## Decision 4: Visual consistency approach

**Decision**: Audit `project-editor-layout.tsx` and replace/update:
1. `‹`/`›` unicode collapse buttons → `ChevronLeft`/`ChevronRight` Lucide icons with `Button variant="ghost" size="icon"` for consistency with the icon system.
2. Header link styles — unify `text-sm text-muted-foreground hover:text-foreground` across Back, Settings, Members links using the same class set.
3. Panel header ("Files" label row) — match spacing/typography with `text-xs font-medium text-muted-foreground uppercase tracking-wide` (already present); ensure button sizing is consistent.
4. Content panel and preview panel — review padding and empty-state typography for visual parity.

**Rationale**: The collapse affordances currently use bare unicode characters that are visually inconsistent with the Lucide icon set used everywhere else. Button variant/size standardisation aligns with ShadCN/UI conventions already in use.

**Alternatives considered**: No change to layout structure — consistent with spec (no restructuring required).
