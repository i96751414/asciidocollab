# Phase 0 Research: Document Outline View

All paths are relative to `apps/web` unless noted.

## §1 — Where document headings come from

**Decision**: Source the Outline from the **existing Lezer-based section outline**, not the Asciidoctor preview model.

- `src/lib/codemirror/asciidoc-outline.ts` exports `SectionOutlineEntry { level, title, line, from, inactive? }` and an `outlineField: StateField<SectionOutlineEntry[]>` computed from the CodeMirror syntax tree (via `asciidoc-heading-levels.ts`). It already resolves `{attr}` references and excludes `[discrete]`/`[float]` headings and inactive conditional branches.
- `src/hooks/use-section-outline.ts` exposes `useSectionOutline()` which mirrors `outlineField` into React state through the editor's update listener. The editor already drives it via `useEditorMount({ onOutlineChange })` → `setOutlineEntries` in `asciidoc-editor.tsx:161,220`.

**Rationale**: This source already exists and is recomputed in step with the editor (no second parse — satisfies the "do NOT add a second parse pass" constraint better than the preview model). It carries the **source `line`/`from`** directly, which is exactly what editor navigation and current-section detection need; the preview worker model only exposes `data-source-line` DOM attributes asynchronously and is keyed to rendered HTML, not source positions.

**Deviation from the prompt**: The plan prompt suggested deriving a `headings` array from `useAsciidocPreview`. We instead reuse the purpose-built `outlineField`/`useSectionOutline`, which is strictly better for source-line navigation and already in place. The `id` field the prompt envisioned (rendered anchor) is **not required** — navigation is by source line through the editor, and scroll-sync moves the preview, so no anchor lookup is needed.

**Required extension (Principle IV)**: `asciidoc-outline.ts:99` currently skips the document title with `info.effectiveLevel < 1` (level 0). FR-006 requires the title (level 0). We will **include level 0** in the emitted entries. This is an extension of a first-party in-repo asset (no vendorable Lezer-compatible equivalent exists to reuse), documented here per Principle IV. The heading-level computation (`asciidoc-heading-levels.ts`) is unchanged — only the outline emission threshold is lowered, and the title row indents flush (level 0).

- **Alternatives considered**: (a) preview-worker `headings` array — rejected (async, HTML-keyed, second source of truth); (b) a brand-new parser pass — rejected (duplication, explicitly forbidden).

## §2 — Navigation & current-section API (reuse the existing seam)

**Decision**: Reuse the editor's existing reveal/scroll-sync and cursor-line signals; add **no** new sync logic.

- **Click-to-navigate**: heading entries carry `line` (1-based) and `from` (offset). The editor already exposes navigation:
  - In-editor: `handleHeadingClick(entry: { from })` (`use-editor-mount.ts`) dispatches `selection {anchor: from}` + `scrollIntoView` + focus.
  - Layout-level: `useEditorNavigation` (owned by `project-editor-layout.tsx`) exposes `handleLineClick(line)` → `revealRequest {line, nonce}`, which the editor consumes to dispatch `selection {anchor: doc.line(line).from}` + `scrollIntoView`. Moving the cursor triggers the existing **scroll-sync**, which moves the preview — so no preview-only jump is hardcoded (satisfies FR-009).
  - **Chosen path**: because the Outline now lives in the layout-level left panel, heading clicks route through the layout's existing `handleLineClick(entry.line)` seam (same mechanism the preview/file navigation already uses).
- **Current-section detection**: the editor already emits cursor changes via `useEditorMount({ onCursorChange })` (`{ line, col, totalLines }`) and a debounced top-of-viewport line via `onScrollLine`. The current heading = the **nearest preceding** outline entry whose `line ≤ currentLine`, using the cursor line (fallback: topmost visible line). This reuses the existing line signal — no second mapping (satisfies FR-008).

**Rationale**: Constitution VIII requires preserving scroll-sync and covering seam changes with regression tests; reusing the existing reveal + cursor-line signals keeps a single source of truth and makes the change testable as "no regression."

- **Alternatives considered**: a dedicated outline→preview scroll handler — rejected (duplicates scroll-sync, violates the constraint).

## §3 — Lifting outline state from editor to layout

**Decision**: Lift the outline entries and current cursor line from `asciidoc-editor.tsx` up to `project-editor-layout.tsx`.

- Today `outlineEntries` and cursor changes are **local** to `asciidoc-editor.tsx` (consumed only by the right-hand `EditorOutlinePanel`). The new left panel is rendered by the parent `project-editor-layout.tsx`.
- `AsciiDocEditor` will accept optional props `onOutlineChange?(entries)` and `onCursorLineChange?(line)` that forward the existing internal `useEditorMount` callbacks. The layout stores them in state and passes them to `OutlineView`. Heading clicks flow back down via the layout's existing `handleLineClick`.

**Rationale**: The view that owns the data (the editor/`EditorView`) surfaces it through a thin callback seam; the layout that owns the panel consumes it. No new global store; the editor remains a thin orchestrator.

- **Alternatives considered**: a React context or external store for outline state — rejected (overkill for one consumer; the callback seam mirrors how outline already flows to the right panel today).

## §4 — Persistence of the active view (`leftPanelTab`)

**Decision**: Add `leftPanelTab: 'files' | 'outline'` (default `'files'`) to the existing `useEditorPreferences` store, persisted to `localStorage` **only** — excluded from the account-sync payload.

- `src/hooks/use-editor-preferences.ts` is localStorage-primary (`LS_KEY = 'asciidocollab:editor-preferences'`) **and** best-effort syncs the whole `EditorPrefs` object to `PUT /auth/me/editor-preferences` (validated by `packages/shared/src/dtos/editor-preferences.dto.ts`).
- To honor FR-010 (per-browser, **not** cross-device) without a parallel store: `leftPanelTab` is added to `EditorPrefs` + `DEFAULT_PREFS` + the localStorage load/save, but the server payload sent in `schedulePut` is narrowed to the existing synced fields (the new field is omitted), and the GET-merge does not read it. **No server DTO/schema change.**

**Rationale**: Satisfies three constraints at once — "same store, no parallel store" (plan prompt), "localStorage, not cross-device" (FR-010 / clarification), and zero backend work. Confirmed with the user (Plan Q2: *same store, localStorage-only*).

- **Alternatives considered**: (a) full account sync — rejected (contradicts FR-010, needs a shared DTO + api + persistence change); (b) a separate `localStorage` key — rejected (a parallel store, explicitly disallowed).

## §5 — Relocating the existing right-hand outline

**Decision**: Remove the right-hand `EditorOutlinePanel` and present the outline solely in the left-panel Outline view. Confirmed with the user (Plan Q1: *move it to the left, remove right*).

- `editor-outline-panel.tsx` (right sidebar, resizable, `storageKey: 'asciidoc-outline-width'`) is removed from `asciidoc-editor.tsx:291`. Its list child `EditorSectionOutline` is **kept and reused** inside the new `OutlineView`.

**Rationale**: The spec's motivation is that panel width is spent entirely on files; a single left-panel outline (switchable) is the intended design and avoids two outline locations.

- **Alternatives considered**: keeping both — rejected by the user (duplication).

## §6 — Switcher rail, tooltips, and accessibility

**Decision**: The rail is a **vertical tablist**; tooltips use native `title` + `aria-label` (no new dependency).

- Rail: `role="tablist"` (vertical), one `role="tab"` icon button per view (`aria-selected`, `aria-controls` → content body `id`), roving up/down focus, lucide icons (`FolderTree`/`Files` for Files, `ListTree`/`List` for Outline). Active icon: `--primary` tint + 2px left accent bar; inactive: `--muted-foreground` + accent hover. Icon-only with `aria-label` (accessible name) + `title` (hover tooltip).
- No shadcn/radix Tooltip component exists in `src/components/ui/`; `@radix-ui/react-tooltip` is **not** installed. Adding it would be a new dependency (Constitution dependency-scanning). Native `title` + `aria-label` satisfies "name each view on hover/focus" (SR users get the name on focus via `aria-label`).

**Rationale**: Keeps the change additive and dependency-free; accessible tablist semantics match the single-view-at-a-time behavior.

- **Alternatives considered**: add `@radix-ui/react-tooltip` for a visible-on-focus tooltip — deferred (heavier; revisit only if a visible focus tooltip is required).

## §7 — No-remount switching

**Decision**: Both Files and Outline views stay **mounted**; switching toggles a `hidden` class on the inactive one. The editor and preview are siblings outside the left panel and are never conditionally unmounted on switch.

**Rationale**: Preserves the file tree's scroll/expansion state and guarantees the editor/preview do not remount (explicit constraint). The Outline view is cheap to keep mounted (memoized list).
