# Contract: Tree Reveal on Selection (`FileTree`)

Covers making a programmatically-selected file visible in the tree. Touches `apps/web/src/components/file-tree/file-tree.tsx`, reusing `useFileTreeUIState.revealSelected` (unchanged) and the existing scroll-into-view routine.

## Behavior

`FileTree` already receives `selectedNodeId: string | null`. When that value **changes** to a node that is not currently visible (one or more ancestor folders collapsed), `FileTree` MUST expand the ancestor folders and scroll the node into view. Implemented via an effect keyed on `selectedNodeId` and `tree` (NOT on `expandedState`).

## Behavioral contract

| # | Given | When | Then |
|---|-------|------|------|
| R1 | A restored `selectedNodeId` is nested in collapsed folders; tree already loaded | the value is applied | all ancestor folders expand and the node is scrolled into view + highlighted |
| R2 | `selectedNodeId` is set before the tree finishes loading (async fetch) | the tree finishes loading | reveal runs once the tree is available (no-op while `tree` is null, then reveals) |
| R3 | `selectedNodeId` is a root-level or already-visible node | the value is applied | no ancestors need expanding; node is scrolled into view; no error |
| R4 | The selected file is visible and the user manually collapses its containing folder | `expandedState` changes (selection unchanged) | the folder STAYS collapsed — reveal does NOT re-fire (keyed on `selectedNodeId`, not `expandedState`) (FR-012) |
| R5 | `selectedNodeId` is `null` | applied | no reveal attempted; no error |
| R6 | `selectedNodeId` changes to a new hidden node mid-session | the value changes | the new node's ancestors expand and it scrolls into view |
| R7 | The same `selectedNodeId` re-renders without changing | re-render | no redundant reveal/scroll (guarded by a last-revealed ref) |

## Requirements traceability

- FR-002 (make restored file visible) → R1, R2, R3
- FR-012 (reveal hidden selection; don't fight manual collapse) → R1, R4, R6, R7
- US1 acceptance scenario 2 (nested collapsed folders) → R1, R2

## Notes

- Reuses `revealSelected` (expand ancestors) and the `containerReference.querySelector('[data-node-id=…]')` + `scrollIntoView({ block: 'nearest' })` pattern already present for the manual "Reveal in tree" action.
- No change to `useFileTreeUIState` or `useFindInTree`; the find session continues to manage its own expansion independently.
