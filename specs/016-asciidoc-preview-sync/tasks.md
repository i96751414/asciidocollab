# Tasks: AsciiDoc Live Preview with Source Sync

**Input**: Design documents from `specs/016-asciidoc-preview-sync/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/ ✅

**TDD note**: The project constitution mandates TDD — test tasks MUST be completed and confirmed failing before the corresponding implementation tasks begin. This applies to all hooks, components, and the Web Worker.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks at the same phase level
- **[Story]**: Maps to user story from spec.md (US1 / US2 / US3)

## Path Conventions

| App | Source root | Test root |
|---|---|---|
| `apps/web` | `apps/web/src/` | `apps/web/tests/` |

Test path mirrors source path: `apps/web/src/hooks/use-foo.ts` → `apps/web/tests/hooks/use-foo.test.ts`

---

## Phase 1: Setup

**Purpose**: Add the new runtime dependency and environment configuration needed by all subsequent phases.

- [X] T001 Add `react-resizable-panels` and `dompurify` to `apps/web/package.json` dependencies and run `pnpm install` from repo root
- [X] T002 [P] Add `NEXT_PUBLIC_PREVIEW_DEBOUNCE_MS` export to `apps/web/src/lib/editor-config.ts` — read from `process.env.NEXT_PUBLIC_PREVIEW_DEBOUNCE_MS`, default `1500`; document alongside the existing `NEXT_PUBLIC_EDITOR_AUTOSAVE_DEBOUNCE_MS` export
- [X] T003 [P] Add `NEXT_PUBLIC_PREVIEW_DEBOUNCE_MS=1500` to `.env.example` with a comment explaining it controls preview auto-refresh delay (separate from the 4000 ms auto-save debounce)

**Checkpoint**: `pnpm install` succeeds; both `react-resizable-panels` and `dompurify` appear in `node_modules`; `editor-config.ts` exports the new constant; `.env.example` documents it.

---

## Phase 2: Foundational — Asciidoctor Web Worker

**Purpose**: The Web Worker that runs Asciidoctor.js off-thread is required before any preview rendering work can begin. Must be complete before Phase 3.

**⚠️ CRITICAL**: All US1, US2, and US3 work depends on this phase.

- [X] T004 Write failing tests for `asciidoc-render.worker` in `apps/web/tests/workers/asciidoc-render.worker.test.ts` — mock `onmessage`/`postMessage`; cover: (a) `RenderResult.ok === true` with HTML containing `data-source-line` attributes when given valid AsciiDoc, (b) `RenderResult.ok === false` with non-null `error` when Asciidoctor throws, (c) `requestId` is echoed correctly, (d) multiple sequential requests each echo their own `requestId`, (e) given AsciiDoc containing an `include::some-file.adoc[]` directive, result is `ok === true` and the HTML output contains the directive as literal text — not blank, not an error — confirming that Asciidoctor.js `safe` mode suppresses include resolution (FR-011), (f) `data-source-line` attributes appear on admonition blocks (`div.admonitionblock`) and list items (`li`) in addition to headings and paragraphs — confirming full block-type coverage required by FR-005

- [X] T005 Create `apps/web/src/workers/asciidoc-render.worker.ts` — (a) import and initialise Asciidoctor.js processor once on first message, (b) register a `TreeProcessor` extension that calls `doc.findBy({})`, reads `getSourceLocation().getLineNumber()` on each block with a source location, and calls `setAttribute('data-source-line', lineNo)`, (c) on each `RenderRequest` message: call `processor.load(content, { safe: 'safe', sourcemap: true })`, run `doc.convert()`, post `RenderResult` with echoed `requestId`; wrap in try/catch and post `{ ok: false, error: e.message }` on failure

**Checkpoint**: Worker tests pass. Running the worker with a sample AsciiDoc heading produces HTML containing `data-source-line="1"` on the `<h1>` element.

---

## Phase 3: US1 — Styled Live HTML Preview

**Goal**: The preview panel renders the document as styled HTML approximating the Asciidoctor-PDF default theme and auto-refreshes within the debounce period after the author stops typing. No manual Refresh action required.

**Independent Test**: Open a `.adoc` file with headings, a code block, a table, a NOTE admonition, and an image reference. The preview panel shows: Georgia serif body text; dark-blue (`#083980`) headings; monospaced code block with light-grey background; table with dark-blue header and border; NOTE with a blue left border. After typing a new paragraph and waiting ~1.5 s, the preview updates without a full-page reload.

- [X] T006 [P] [US1] Write failing tests for `useAsciidocPreview` in `apps/web/tests/hooks/use-asciidoc-preview.test.ts` — mock `Worker` and `DOMPurify`; cover: (a) state transitions `idle → pending → rendering → up-to-date` on content change + worker response, (b) state transitions to `error` on `ok: false` worker result with previous `html` retained, (c) stale `requestId` responses are discarded with no state change — this case also covers rapid complete-content replacement (simulating file navigation) where a prior render arrives after a newer one has already been dispatched, (d) debounce: rapid content changes produce only one worker message after debounce period, (e) `scrollToLine` prop change calls `querySelector('[data-source-line="N"]')` and `scrollIntoView`, (f) `scrollTop` is saved and restored across re-renders, (g) `isEnabled: false` transitions state to `idle`, (h) when `isEnabled` transitions from `false` back to `true` with unchanged content, a fresh render is triggered — state transitions `idle → pending → rendering` (covers the collapse → expand → resume cycle required by FR-008), (i) when `ok === true`, `DOMPurify.sanitize` is called with the Worker HTML before it is stored; assert that a passthrough `<script>` tag in the raw Worker output is absent from the stored `html` value

- [X] T007 [P] [US1] Create `apps/web/src/styles/asciidoc-preview.css` scoped to `.asciidoc-preview-content` — implement PDF-like styling: body `font-family: Georgia, serif; font-size: 14px; max-width: 800px; margin: 0 auto; color: #333`; headings `font-weight: bold; color: #083980` with sizes `h1: 2em, h2: 1.6em, h3: 1.3em, h4: 1.1em`; code/pre `font-family: 'Courier New', monospace; background: #f7f7f8; border: 1px solid #e8e8e8; padding: 0.75em; border-radius: 3px`; table `border-collapse: collapse; width: 100%` with `thead { background: #083980; color: white }` and `td, th { border: 1px solid #ddd; padding: 0.5em }`; admonitions as `div.admonitionblock` with `border-left: 4px solid <colour>; padding: 0.75em 1em; margin: 1em 0; background: <tint>` where NOTE=`#083980`, WARNING=`#eb8e03`, CAUTION=`#e40000`, TIP=`#2b9c34`, IMPORTANT=`#7b4191`; links `color: #083980`

- [X] T008 [US1] Implement `useAsciidocPreview` hook in `apps/web/src/hooks/use-asciidoc-preview.ts` — (a) create `Worker` on mount, terminate on unmount, (b) debounce content changes using `PREVIEW_DEBOUNCE_MS` from editor-config, (c) manage `PreviewState` machine per data-model.md, (d) increment `requestId` on each send; discard responses with mismatched id, (e) on successful render: call `DOMPurify.sanitize(result.html, { USE_PROFILES: { html: true } })` first, then save `previewRef.current.scrollTop`, set `innerHTML` to the sanitized string, restore `scrollTop`, (f) on `scrollToLine` change (non-null): find `[data-source-line="${scrollToLine}"]` or nearest predecessor, call `scrollIntoView({ behavior: 'smooth', block: 'start' })`

- [X] T009 [US1] Write failing tests for rewritten `AsciiDocPreview` in `apps/web/tests/components/asciidoc-preview.test.tsx` — mock `useAsciidocPreview`; cover: (a) renders HTML output inside `.asciidoc-preview-content` when `html` is non-null, (b) shows "rendering" indicator when state is `pending` or `rendering`, (c) shows "✓" indicator when state is `up-to-date`, (d) shows "Preview not available" message when `isEnabled` is false, (e) `data-testid="asciidoc-output"` present when HTML rendered

- [X] T010 [US1] Rewrite `apps/web/src/components/asciidoc-preview.tsx` — (a) call `useAsciidocPreview({ content, isEnabled, scrollToLine })`, (b) render HTML in a `div` with `ref={previewRef}` and inner `div.asciidoc-preview-content` using `dangerouslySetInnerHTML={{ __html: html ?? '' }}`, (c) import `asciidoc-preview.css`, (d) render basic sync indicator in panel header (`pending`/`rendering` → animated dot; `up-to-date` → "✓"); full error and idle indicator states added in Phase 5

**Checkpoint**: US1 independently testable. Opening an AsciiDoc file shows a styled preview that auto-updates; the preview header shows the sync state.

---

## Phase 4: US2 — Click-to-Scroll Source-to-Preview Tracking

**Goal**: Clicking on any line in the AsciiDoc editor scrolls the preview panel to display the rendered content corresponding to that line.

**Independent Test**: Open a 200-line AsciiDoc file. Click on a line inside Section 5. The preview scrolls so Section 5's heading is visible near the top. Click on a line inside Section 2; the preview scrolls up to Section 2. Both jumps occur within 300 ms of the click.

- [X] T011 [P] [US2] Write failing tests for `onLineClick` in `apps/web/tests/hooks/use-editor-mount.test.ts` — (a) simulate `mousedown` event on the editor container at a known position; assert `onLineClick` is called with the correct 1-based line number, (b) `onLineClick` not called when `onLineClick` option is not provided, (c) `onLineClick` not called on keyboard events (arrow keys, Page Down)

- [X] T012 [US2] Update `apps/web/src/hooks/use-editor-mount.ts` — add optional `onLineClick?: (line: number) => void` to `UseEditorMountOptions`; when provided, register a `domEventHandlers` extension on the `EditorView` that listens to `mousedown`; compute `view.posAtCoords({ x: event.clientX, y: event.clientY })`; resolve line via `view.state.doc.lineAt(pos).number`; call `onLineClick(lineNumber)`

- [X] T013 [US2] Update `apps/web/src/components/editor/asciidoc-editor.tsx` — add optional `onLineClick?: (line: number) => void` prop to `AsciiDocEditorProperties`; forward it to `useEditorMount` options

- [X] T014 [US2] Update `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx` — (a) add `clickedLine` state (`number | null`, initial `null`), (b) pass `onLineClick={line => setClickedLine(line)}` to `AsciiDocEditor`, (c) pass `scrollToLine={clickedLine}` to `AsciiDocPreview`

**Checkpoint**: US2 independently testable. Clicking in the editor causes the preview to scroll to the correct section.

---

## Phase 5: US3 — Full Sync State Indicator

**Goal**: The preview header always accurately reflects render state, including error conditions and non-AsciiDoc files, with actionable information for the author.

**Independent Test**: Open a file. Confirm indicator shows "✓". Type several lines — indicator immediately shows animated dot (pending). Wait for debounce — indicator returns to "✓". Introduce a malformed Asciidoctor attribute that causes a render failure — indicator shows "⚠ Preview error" with the error message visible; the previous rendered HTML remains visible beneath it. Select a `.json` file — indicator shows a neutral "–" and the preview area shows "Preview not available for this file type."

- [X] T015 [P] [US3] Write failing tests for full sync indicator in `apps/web/tests/components/asciidoc-preview.test.tsx` — add: (a) error state: `state === 'error'` shows "⚠ Preview error" label and `error` message string visible, previous `html` still rendered in output, (b) `isEnabled === false`: indicator shows "–" and content area shows neutral "Preview not available for this file type" message, (c) error indicator hides when `state` transitions back to `pending`

- [X] T016 [US3] Update `apps/web/src/components/asciidoc-preview.tsx` — extend sync indicator: add `error` state rendering ("⚠ Preview error" + `error` message in a dismissible callout below header); add `idle` state ("–" indicator + "Preview not available for this file type" in content area replacing empty output); ensure previous `html` remains visible when state is `error`

**Checkpoint**: US3 independently testable. All three indicator states (up-to-date, rendering, error) are visually distinct and accurately reflect preview state. Non-AsciiDoc files show a neutral state.

---

## Phase 6: Polish — Resizable Editor/Preview Layout

**Purpose**: Replace the fixed-width preview panel with a drag-to-resize split. Proportional scaling on window resize; 20% minimum per panel; session-only split ratio.

- [X] T017 Write failing tests for resizable layout in `apps/web/tests/components/project-editor-layout.test.tsx` — (a) when preview is open, a resize handle element is rendered between editor and preview panels, (b) editor and preview panels are wrapped in a `PanelGroup`, (c) when preview is closed (sidebar-only), no resize handle is rendered

- [X] T018 Update `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx` — (a) import `PanelGroup`, `Panel`, `PanelResizeHandle` from `react-resizable-panels`, (b) wrap the editor `div` and preview `div` in `<PanelGroup direction="horizontal">`, (c) editor in `<Panel defaultSize={50} minSize={20}>`, (d) preview in `<Panel defaultSize={50} minSize={20}>` (only rendered when `showPreview`), (e) `<PanelResizeHandle>` between them with a visible drag indicator (thin border + hover state); remove the fixed `w-80` class from the preview panel

**Checkpoint**: Drag handle visible between editor and preview. Dragging resizes both panels simultaneously. Neither panel collapses below 20%. Resizing the browser window keeps the ratio proportional.

---

## Phase 7: Quality Gate

- [X] T019 [P] Run `pnpm --filter @asciidocollab/web lint` — zero violations; fix any lint errors introduced by this feature
- [X] T020 [P] Run `pnpm --filter @asciidocollab/web typecheck` — zero type errors; fix any type issues (pay attention to Worker message types and `react-resizable-panels` typings)
- [X] T021 Run `pnpm --filter @asciidocollab/web test` — all tests green; total count should increase from 454

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Worker)**: Depends on Phase 1 — blocks all user story phases
- **Phase 3 (US1)**: Depends on Phase 2 — can start as soon as Worker is complete
- **Phase 4 (US2)**: Depends on Phase 2 — can run in parallel with Phase 3 (separate files)
- **Phase 5 (US3)**: Depends on Phase 3 (extends `asciidoc-preview.tsx`)
- **Phase 6 (Polish)**: Depends on Phase 4 (extends layout); can start after T014
- **Phase 7 (Quality Gate)**: Depends on all phases complete

### User Story Dependencies

- **US1 (P1)**: Depends on Worker (Phase 2). No dependency on US2 or US3.
- **US2 (P1)**: Depends on Worker (Phase 2). No dependency on US1 or US3 — uses independent code paths (editor mount hook + layout wiring).
- **US3 (P2)**: Depends on US1 (`asciidoc-preview.tsx` must exist to extend).

### Within Each Phase

- Write test → confirm FAIL → implement → confirm PASS (TDD red-green cycle)
- Tasks marked [P] within the same phase can run concurrently
- Commit after each task or logical group (Conventional Commits: `feat(016)`, `test(016)`)

### Parallel Opportunities

```bash
# Phase 1 — run together:
T002: editor-config.ts export
T003: .env.example entry

# Phase 3 — start together (both independent of each other):
T006: write useAsciidocPreview tests
T007: create asciidoc-preview.css

# Phase 4 — start together:
T011: write use-editor-mount onLineClick tests
T012: (implement, after T011 fails)

# Phase 7 — run together:
T019: lint
T020: typecheck
```

---

## Implementation Strategy

### MVP (US1 Only — Phases 1–3)

1. Complete Phase 1: Setup
2. Complete Phase 2: Worker foundation
3. Complete Phase 3: Styled live preview
4. **STOP and VALIDATE**: Open a real AsciiDoc file, confirm live-updating styled preview
5. Demo-ready: authors can see a PDF-like preview updating as they type

### Incremental Delivery

1. Phases 1–3 → styled live preview (MVP)
2. Phase 4 → click-to-scroll tracking (US2)
3. Phase 5 → full sync indicator (US3)
4. Phase 6 → resizable layout (polish)
5. Phase 7 → quality gate

---

## Notes

- The Worker (`T005`) runs synchronously inside the worker thread — there is no internal async within the worker; concurrency is managed by the `requestId` discard mechanism in `useAsciidocPreview`
- `dangerouslySetInnerHTML` is intentional: Asciidoctor output is trusted (same-origin, no user-supplied URLs in preview context); document this in the component
- The `build:worker` tsc script (`apps/web/src/workers/tsconfig.json`) already includes all `*.ts` files in the workers directory — `asciidoc-render.worker.ts` is picked up automatically
- Asciidoctor's `sourcemap: true` option must be passed to `processor.load()` (not `processor.convert()`) to enable source location tracking in the AST
- [P] = different files, no incomplete-task dependencies; safe to run concurrently
