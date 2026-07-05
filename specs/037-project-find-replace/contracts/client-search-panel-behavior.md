# Contract: Client Search Panel & In-Editor Restyle Behavior

Client-side behavioral contract for the left-panel **Search** tab and the restyled in-editor find/replace. No server contract here; consumes the search/replace routes.

## Left-panel Search tab (FR-001, FR-002)

- `LeftPanelTab` (in `use-editor-preferences.ts`) gains `'search'`; `isLeftPanelTab` and the persisted-value validation accept it. Persistence stays **client-only** (localStorage, `CLIENT_ONLY_KEYS`) — a per-user preference (Principle VII), remembered across reload (SC-007).
- `left-panel-rail.tsx` `VIEWS` appends `{ id: 'search', label: 'Search', icon: Search }` (lucide) — same rail icon treatment, roving focus, and active-accent bar as Files/Outline.
- `left-panel.tsx` gains a `searchSlot`, always mounted, `hidden` when inactive (preserves query/results/scroll like the other tabs).
- Collapse/restore/remember behaves exactly as Files/Outline (SC-006, SC-007).

## Search view (`search-view.tsx`)

- Input + option toggles (case, whole-word, regex mode) + replacement input + controls, styled from **design tokens**, correct in light/dark (Principle V). Visual language matches `FindPanel` and `OutlineView`.
- Query is **debounced**; each new query aborts the previous request (`AbortController`) — cancelable (FR-006c).
- States: idle / in-progress / no-results / error (invalid regex shows an **inline** error from the 400 `INVALID_PATTERN`) (FR-015, FR-006b).
- Results grouped by file with per-file and true-total counts; when `capped`, show a "showing N of M — refine to see more" affordance (FR-016). `skippedFiles` surfaced subtly.
- Activating a result opens its file and places the cursor/selection at the match, scrolled into view (FR-005) — reuse the outline/file-open navigation seam.
- Replace controls: replace this match / replace file / replace all; each match has an include/exclude affordance with before/after preview for the current replacement (FR-008a). A project-wide replace-all confirms scope (count of matches + files) before committing (FR-009). Excluded matches are omitted from the `ReplaceRequestDto`.
- After a successful replace, results refresh (re-query) so resolved matches disappear.

## In-editor find/replace restyle (FR-014)

- Keep `search({ top: true })` and `searchKeymap` — behavior and keyboard shortcuts unchanged.
- Add a CodeMirror theme extension (`search-panel-theme.ts`) styling `.cm-search`/`.cm-panel` inputs, buttons, and toggles from design tokens; correct in light/dark; visually consistent with the Search tab.
- Must not alter scroll-sync (Principle VIII) — E2E asserts no regression.
- Remains **single-file** (project-wide lives in the Search tab; the panel offers no scope selector — FR-003a).
