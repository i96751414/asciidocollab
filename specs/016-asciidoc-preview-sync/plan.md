# Implementation Plan: AsciiDoc Live Preview with Source Sync

**Branch**: `016-asciidoc-preview-sync` | **Date**: 2026-06-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/016-asciidoc-preview-sync/spec.md`

## Summary

Replace the existing manual-refresh AsciiDoc preview with a live, styled preview that: renders off the main thread via a Dedicated Web Worker running Asciidoctor.js; debounces re-renders (default 1500 ms, configurable via `NEXT_PUBLIC_PREVIEW_DEBOUNCE_MS`); displays a sync state indicator; approximates the Asciidoctor-PDF default theme; and scrolls the preview panel to the element corresponding to the editor line the author clicked. The editor-to-preview panel divider becomes draggable (via `react-resizable-panels`) with a default 50/50 split, 20% minimum per panel, and proportional scaling on window resize.

## Technical Context

**Language/Version**: TypeScript 6, running in Next.js 16 App Router (client components)

**Primary Dependencies**:
- `asciidoctor ^3.0.4` — already declared; runs in Worker scope
- `dompurify` — new dependency; sanitizes Asciidoctor HTML output before DOM injection, blocking XSS via AsciiDoc passthrough blocks (`++++…++++`)
- `react-resizable-panels` — new dependency; backs shadcn Resizable; handles drag, proportional scaling, min/max
- CodeMirror 6 (`@codemirror/view`) — existing; extended with `domEventHandlers` for click tracking

**Storage**: N/A — no new API routes, no database changes

**Testing**: Jest + Testing Library (existing); Worker mocked in Jest via `jest.fn()`

**Target Platform**: Browser (client component); Worker environment (`lib: ["WebWorker"]`)

**Performance Goals**:
- Preview updates within debounce period (≤ 1500 ms default) after typing stops
- Editor click → preview scroll within 300 ms
- Zero keypress latency degradation (all rendering off main thread)

**Constraints**:
- No new API routes; no Prisma changes; no domain layer changes
- Worker output compiled to `public/workers/` by existing `build:worker` script
- Preview stylesheet scoped to `.asciidoc-preview-content` wrapper — no global CSS leaks
- `data-source-line` attributes are the only coupling between Asciidoctor output and scroll logic
- Asciidoctor `safe: 'safe'` mode preserved (not `secure`) so custom attributes are retained; passthrough HTML is sanitized by DOMPurify before DOM injection — passthrough blocks with safe HTML are preserved, scripts and event handlers are stripped

**Scale/Scope**: Single-user editing session; one Worker per mounted preview; documents up to 10,000+ lines handled by extended debounce (degradation acceptable for large docs per spec)

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| Clean Code — readable names, single responsibility | ✅ Pass | `useAsciidocPreview`, `asciidoc-render.worker` each do one thing |
| TDD — red-green-refactor | ✅ Pass | All hooks and the rewritten component have test files in plan |
| In-memory fakes for domain repos | ✅ N/A | No domain layer changes; Worker is mocked in tests |
| Infrastructure tests against real deps | ✅ N/A | No infrastructure changes |
| No `any` in production code | ✅ Pass | Worker message types are fully typed (`RenderRequest`, `RenderResult`) |
| No `as` casts | ✅ Pass | No unsafe casts planned |
| Test files in `tests/` not `__tests__` | ✅ Pass | All test paths use `apps/web/tests/` convention |
| No business logic in route handlers | ✅ N/A | Purely frontend; no new routes |
| Domain zero external deps | ✅ N/A | Domain layer untouched |
| Cross-package DTOs via `packages/shared` | ✅ N/A | No cross-package communication introduced |
| No Prisma migration without user consent | ✅ N/A | No schema changes |
| XSS via dangerouslySetInnerHTML | ✅ Mitigated | Asciidoctor `safe` mode does not strip passthrough blocks; DOMPurify sanitizes output before injection — prevents stored XSS in collaborative editing sessions |

**Complexity justification**: Two new runtime dependencies. `react-resizable-panels` replaces ~200 LOC of custom pointer-event drag handling. `dompurify` (~50 LOC integration) mitigates a stored XSS vector that would otherwise require a retroactive security patch when real-time collaboration lands. Both costs are justified.

## Project Structure

### Documentation (this feature)

```text
specs/016-asciidoc-preview-sync/
├── plan.md                      ← this file
├── research.md                  ← decisions on Worker, source map, CSS, resize, click tracking
├── data-model.md                ← PreviewState, RenderRequest/Result, ResizeSplit, HTML conventions
├── contracts/
│   ├── hooks.md                 ← useAsciidocPreview, useEditorMount (extended)
│   ├── components.md            ← AsciiDocPreview, ProjectEditorLayout (updated), AsciiDocEditor (updated)
│   └── worker-protocol.md      ← Worker message schema and TreeProcessor behaviour
└── tasks.md                     ← generated by /speckit-tasks
```

### Source Code

```text
apps/web/
├── src/
│   ├── workers/
│   │   └── asciidoc-render.worker.ts         NEW — Dedicated Worker; runs Asciidoctor.js + TreeProcessor
│   ├── hooks/
│   │   ├── use-asciidoc-preview.ts           NEW — Worker lifecycle, debounce, PreviewState machine, scroll
│   │   └── use-editor-mount.ts               UPDATED — add onLineClick option + mousedown handler
│   ├── components/
│   │   ├── asciidoc-preview.tsx              REWRITE — styled output, sync indicator, uses useAsciidocPreview
│   │   └── editor/
│   │       └── asciidoc-editor.tsx           UPDATED — add onLineClick prop, forward to useEditorMount
│   ├── app/(dashboard)/dashboard/projects/[id]/
│   │   └── project-editor-layout.tsx         UPDATED — PanelGroup resize layout, clickedLine state
│   └── styles/
│       └── asciidoc-preview.css              NEW — PDF-like stylesheet scoped to .asciidoc-preview-content
└── tests/
    ├── workers/
    │   └── asciidoc-render.worker.test.ts    NEW — Worker message handling, TreeProcessor output
    ├── hooks/
    │   ├── use-asciidoc-preview.test.ts      NEW — state machine, debounce, scroll, stale result discard
    │   └── use-editor-mount.test.ts          UPDATED — add onLineClick callback coverage
    └── components/
        ├── asciidoc-preview.test.tsx         REWRITE — sync indicator states, scroll behaviour, error retention
        └── project-editor-layout.test.tsx    UPDATED — resize panel rendering, click→scroll wiring
```

## Implementation Phases

### Phase A — Worker and rendering foundation

Deliver: `asciidoc-render.worker.ts` + `use-asciidoc-preview.ts` + tests. Preview renders off-thread with correct state transitions and stale-result discard. No UI changes yet.

**Key tasks:**
1. Add `react-resizable-panels` and `dompurify` to `apps/web/package.json`
2. Create `asciidoc-render.worker.ts` — imports Asciidoctor, registers TreeProcessor, handles `RenderRequest` → `RenderResult`
3. Create `use-asciidoc-preview.ts` — Worker lifecycle, debounce, PreviewState machine, scroll-to-line on `scrollToLine` change; wrap each successful `RenderResult.html` with `DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })` before storing or injecting
4. Add `NEXT_PUBLIC_PREVIEW_DEBOUNCE_MS` to `apps/web/src/lib/editor-config.ts` (default 1500)
5. Add `NEXT_PUBLIC_PREVIEW_DEBOUNCE_MS` to `.env.example`
6. Tests: Worker unit tests (mock `onmessage`/`postMessage`); hook tests (mock Worker, test state machine, debounce, stale discard, scroll, and DOMPurify sanitization of passthrough content)

### Phase B — PDF-like stylesheet

Deliver: `asciidoc-preview.css` with full visual approximation of the Asciidoctor-PDF default theme.

**Key tasks:**
7. Create `apps/web/src/styles/asciidoc-preview.css` — serif body, dark-blue headings, code blocks, table, admonition variants, max-width container
8. Verify visually: open a document with headings, code, table, NOTE/WARNING/TIP/CAUTION/IMPORTANT admonitions and confirm each is visually distinct and approximates the PDF look

### Phase C — Preview component rewrite

Deliver: `asciidoc-preview.tsx` rewritten to use `useAsciidocPreview`, apply the PDF stylesheet, and show the sync indicator.

**Key tasks:**
9. Rewrite `asciidoc-preview.tsx` — consume `useAsciidocPreview`, attach `previewRef`, apply `.asciidoc-preview-content` wrapper with imported CSS, render sync state indicator in header
10. Update/rewrite `apps/web/tests/components/asciidoc-preview.test.tsx` — test all three indicator states, error-HTML retention, non-AsciiDoc idle state

### Phase D — Editor click tracking

Deliver: Editor emits `onLineClick`; layout wires it to the preview's `scrollToLine`.

**Key tasks:**
11. Update `use-editor-mount.ts` — add `onLineClick` option; register `domEventHandlers` on `mousedown` to compute and emit line number
12. Update `asciidoc-editor.tsx` — add `onLineClick` prop; forward to `useEditorMount`
13. Update `apps/web/tests/hooks/use-editor-mount.test.ts` — cover `onLineClick` callback

### Phase E — Resizable layout

Deliver: `ProjectEditorLayout` with drag-to-resize editor/preview split. End-to-end wiring: click in editor → preview scrolls.

**Key tasks:**
14. Update `project-editor-layout.tsx` — replace fixed `w-80` preview with `PanelGroup` / `Panel` / `PanelResizeHandle`; hold `clickedLine` state; wire `onLineClick` → `setClickedLine`; pass `scrollToLine={clickedLine}` to `AsciiDocPreview`
15. Update `apps/web/tests/components/project-editor-layout.test.tsx` — cover resize handle presence, click→scroll wiring

### Phase F — Quality gate

**Key tasks:**
16. `pnpm --filter @asciidocollab/web lint` — zero violations
17. `pnpm --filter @asciidocollab/web typecheck` — zero errors
18. `pnpm --filter @asciidocollab/web test` — all tests green

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `react-resizable-panels` | Drag-to-resize with proportional scaling, keyboard a11y, min/max constraints | Custom pointer-event implementation is ~200 LOC with browser quirks for pointer capture, touch, and proportional resize on window resize |
| `dompurify` | Sanitize Asciidoctor HTML before DOM injection to prevent stored XSS via passthrough blocks | `safe: 'safe'` mode does not strip inline HTML; `safe: 'secure'` would block legitimate passthrough content; DOMPurify is the established sanitizer that strips scripts while preserving safe HTML |
| Dedicated Web Worker | Render off main thread per FR-006 | Main-thread rendering blocks keystrokes during Asciidoctor.js parse of large documents |
| Asciidoctor TreeProcessor | Inject `data-source-line` for exact line→element mapping | Heading-only heuristic fails for paragraphs, code blocks, tables inside sections |
