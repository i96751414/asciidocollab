# Quickstart: Document Outline View

How the two-view left panel behaves, for reviewers and manual verification. Paths relative to `apps/web`.

## Switching views (the activity rail)

1. Open a project in the editor (`/dashboard/projects/[id]`). The left panel shows a slim **activity rail** on its far-left edge with two icons: **Files** (top) and **Outline**, and a content column to its right.
2. The content column header shows the active view's uppercase title — **FILES** or **OUTLINE** — on the left.
3. Click the **Outline** icon (or focus the rail and press ↓/↑): the content swaps in place to the document outline. The active icon shows a primary tint + a 2px left accent bar; the inactive icon is muted.
4. Switch back to **Files**: the file tree reappears with its scroll position and expanded folders **intact** (both views stay mounted; only visibility toggles). The editor and preview do **not** reload or reflow.
5. Your choice is remembered: reload the page and the same view is active (persisted per-user in `localStorage`; not synced across devices).

**Accessibility**: the rail is a vertical tablist (`role="tablist"` / `role="tab"`, `aria-selected`, `aria-controls`). Each icon button has an `aria-label` and a hover `title`. Up/down arrows move focus between tabs.

## File actions live with Files

- While **Files** is active, the content header shows the **+** new-file button and the options (**⋯**) menu on the right.
- While **Outline** is active, those controls are hidden; the header shows the **OUTLINE** title alone (an optional Collapse/Expand-all toggle may appear).

## Reading the outline

- The outline lists every heading of the open document — the **document title (level 0)** and **section levels 1–5** — in document order, indented by level (title flush; deeper levels stepped in).
- Long titles are truncated to one line.
- The heading whose section contains your cursor is marked **current** (primary tint + accent bar, `aria-current="true"`). Move the cursor into another section and the current marker follows it; exactly one heading is current at a time.

## Navigating

- Click any heading row: the **editor** scrolls to that heading's source line and places the cursor there. The live **preview follows** via the existing editor↔preview scroll-sync — there is no separate preview jump.
- This reuses the editor's existing reveal/scroll-sync seam; no new sync path is introduced.

## Empty states

- **No document open** (or a non-AsciiDoc/binary file): the outline shows *"Open a document to see its outline."*
- **Document with no headings**: it shows *"No headings yet — add a section title (=, ==, …)."*

## Manual verification checklist

- [ ] Rail switches views in place; editor/preview do not remount; file-tree state survives the switch.
- [ ] Active view persists across reload (same browser); a second user on the same browser is unaffected.
- [ ] Outline includes the document title (level 0) and levels 1–5, correctly nested, in order.
- [ ] Current-section marker follows the cursor; exactly one current at a time.
- [ ] Clicking a heading moves the editor to its line and the preview follows (scroll-sync unchanged).
- [ ] File **+**/**⋯** actions show only while Files is active.
- [ ] Both empty states render the exact copy above.
- [ ] Rail, header, and active states are legible in light **and** dark mode (token-driven).
- [ ] The previous right-hand outline sidebar is gone (single outline location).

## Automated coverage (TDD)

- `tests/lib/codemirror/asciidoc-outline.test.ts` — level-0 (title) inclusion + ordering/nesting.
- `tests/hooks/use-editor-preferences.test.*` — `leftPanelTab` default, localStorage round-trip, and **not** sent to the account API.
- `tests/components/editor/left-panel*.test.tsx` — tablist semantics, roving focus, `aria-selected`/`aria-controls`, file-actions visibility per view, no-remount toggle.
- `tests/components/editor/outline-view.test.tsx` — nesting, current-row (`aria-current`), click → `onHeadingClick(entry)`, both empty states.
- `e2e/editor-left-panel-outline.spec.ts` — switch views, persist across reload, click-to-navigate (editor + preview follow), current-section highlight.
