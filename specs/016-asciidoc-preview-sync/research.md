# Research: AsciiDoc Live Preview with Source Sync

## Decision 1 — Asciidoctor.js Web Worker integration

**Decision**: Run Asciidoctor.js inside a Dedicated Web Worker compiled by the existing `build:worker` tsc pipeline (`apps/web/src/workers/tsconfig.json` → `public/workers/`).

**Rationale**: The existing project already compiles `file-tree-events.worker.ts` to `public/workers/` via `tsc`. The pattern is: add the new file to `apps/web/src/workers/`, it is picked up automatically by `"include": ["*.ts"]` in the workers tsconfig, and compiled to `public/workers/asciidoc-render.worker.js`. The consumer instantiates it with `new Worker('/workers/asciidoc-render.worker.js')`. The worker tsconfig already sets `"lib": ["WebWorker", "ES2022"]` making the environment correct.

`asciidoctor ^3.0.4` is already a declared dependency. It ships a UMD/CJS build compatible with Worker scope via `importScripts` or dynamic `import()`. In a module worker the ESM import works directly.

**Alternatives considered**:
- `new Worker(new URL('./worker.ts', import.meta.url))` — the Next.js webpack approach; rejected because the project uses the pre-compile-to-public pattern for the existing SharedWorker, and consistency matters more than bundler magic.
- `SharedWorker` — rejected; a SharedWorker shared across tabs is useful for SSE fan-out (file-tree case) but not for per-file rendering: each editor tab should have an independent render lifecycle.

---

## Decision 2 — Source map: Asciidoctor TreeProcessor extension

**Decision**: Register a custom Asciidoctor.js `TreeProcessor` extension inside the worker that walks the parsed document AST (with `sourcemap: true`) and injects a `data-source-line` attribute onto every block-level node before HTML conversion. The consumer queries `previewRoot.querySelector('[data-source-line="N"]')` and calls `scrollIntoView`.

**Rationale**: Asciidoctor.js exposes `processor.load(content, { safe: 'safe', sourcemap: true })` which attaches source location objects (`source_location.file`, `source_location.lineno`) to each block node. A `TreeProcessor` can iterate `doc.findBy({})` and call `node.setAttribute('data-source-line', node.getSourceLocation().getLineNumber())` before `doc.convert()` produces the HTML string. This gives exact line-number → HTML element mapping for all block types (sections, listing blocks, tables, paragraphs, admonitions, example blocks).

The attribute is stripped from the rendered HTML only if Asciidoctor's safe mode removes custom attributes — but `safe: 'safe'` (not `secure`) preserves custom attributes.

**Alternatives considered**:
- Heading-only heuristic (scan source for `^=+ ` lines, map to generated heading IDs): simpler but only works for headings; clicking inside a code block would scroll to the wrong position.
- Post-processing the output HTML with a regex: fragile and unable to map line numbers without the AST.

---

## Decision 3 — Debounce configuration

**Decision**: Read the preview debounce from `process.env.NEXT_PUBLIC_PREVIEW_DEBOUNCE_MS` with a default of `1500` (ms). Defined alongside `NEXT_PUBLIC_EDITOR_AUTOSAVE_DEBOUNCE_MS` in `apps/web/src/lib/editor-config.ts`.

**Rationale**: The project already uses `NEXT_PUBLIC_*` env vars in `editor-config.ts` for the auto-save debounce (`NEXT_PUBLIC_EDITOR_AUTOSAVE_DEBOUNCE_MS`, default 4000). The preview debounce follows the same pattern. 1500 ms is short enough to feel live without flooding the worker with renders during continuous typing.

**Alternatives considered**:
- Hardcoded constant: simpler but violates the spec requirement that it be application-level configurable.
- Per-user preference: rejected in the clarification session.

---

## Decision 4 — PDF-like preview stylesheet

**Decision**: Create `apps/web/src/styles/asciidoc-preview.css` — a standalone CSS file loaded by the preview component — that approximates the Asciidoctor-PDF default theme visual characteristics. Injected into the preview via a `<style>` import or Next.js CSS module scoped to the preview container.

**Key visual properties to replicate from Asciidoctor-PDF default theme**:

| Element | Asciidoctor-PDF default | HTML approximation |
|---|---|---|
| Body font | Noto Serif | Georgia, serif |
| Code font | Noto Mono | 'Courier New', monospace |
| Base font size | 10.5pt | 14px |
| Heading weight | Bold, dark blue (`#083980`) | Bold, `#083980` |
| Heading sizes | H1 > H2 > H3 with clear steps | `2em / 1.6em / 1.3em / 1.1em` |
| Code block bg | `#f7f7f8` with `#e8e8e8` border | Same |
| Table header bg | `#083980` with white text | Same |
| Table border | `1px solid #dddddd` | Same |
| NOTE admonition | Blue left border + "Note" label | `border-left: 4px solid #083980` |
| WARNING admonition | Orange left border | `border-left: 4px solid #eb8e03` |
| CAUTION admonition | Red left border | `border-left: 4px solid #e40000` |
| TIP admonition | Green left border | `border-left: 4px solid #2b9c34` |
| IMPORTANT admonition | Purple left border | `border-left: 4px solid #7b4191` |
| Page max-width | ~170mm | `800px` centred |
| Link colour | `#083980` | Same |

The stylesheet is scoped to a `.asciidoc-preview-content` wrapper class to prevent leaking into the surrounding UI.

**Rationale**: The spec requires the preview to "closely approximate" the default Asciidoctor-PDF theme. A hand-crafted CSS file achieves this without pulling in the official Asciidoctor CSS (which targets web output, not PDF-equivalent output). The PDF theme's distinct dark blue heading colour (`#083980`) and serif body font are the two properties that most immediately signal "this looks like the PDF".

**Alternatives considered**:
- Official `asciidoctor.css` stylesheet: targets web conventions (sans-serif, browser defaults) rather than PDF aesthetics.
- Inline Tailwind `prose` classes: already used as a stopgap in the existing component; too generic to approximate PDF style.

---

## Decision 5 — Drag-to-resize panel implementation

**Decision**: Add `react-resizable-panels` as a dependency and use it to replace the fixed-width flex layout in `project-editor-layout.tsx` with a `PanelGroup` / `Panel` / `PanelResizeHandle` layout. Default split: 50 / 50 between editor and preview. Minimum panel size: 20% (prevents either panel from being collapsed via drag).

**Rationale**: `react-resizable-panels` is the library that backs shadcn/ui's `Resizable` primitive. It handles pointer events, keyboard accessibility, proportional resizing on window resize, and minimum/maximum size constraints out of the box. It is well-maintained, framework-agnostic (works with SSR), and already indirectly used by shadcn. Adding it directly avoids generating a shadcn component file just for this one layout.

The file tree (left panel) keeps its current fixed-width collapsible behaviour — it is not part of the resizable split, which only covers editor ↔ preview.

**Alternatives considered**:
- Custom CSS + `mousedown`/`mousemove`/`mouseup`: works but requires handling pointer capture, touch events, keyboard resize, proportional behaviour on window resize, and min/max constraints — significant complexity for no real benefit.
- shadcn Resizable component generator: equivalent outcome but generates boilerplate into `components/ui/`; direct library usage is cleaner.

---

## Decision 6 — Editor click → preview scroll wiring

**Decision**: Add a `onLineClick?: (line: number) => void` callback to `useEditorMount`'s options. Inside `useEditorMount`, register a CodeMirror `domEventHandlers` extension that listens to `mousedown` on the editor container, computes the document position at the click coordinates via `view.posAtCoords()`, resolves the line number via `view.state.doc.lineAt(pos).number`, and calls `onLineClick(lineNumber)`.

`AsciiDocEditor` receives an `onLineClick` prop, passes it to `useEditorMount`, and lifts the clicked line number up to `ProjectEditorLayout`. The layout passes a `scrollToLine` prop down to `AsciiDocPreview`, which queries `previewRoot.querySelector('[data-source-line="${scrollToLine}"]')` and calls `.scrollIntoView({ behavior: 'smooth', block: 'start' })`.

**Rationale**: CodeMirror's `domEventHandlers` facet is the idiomatic way to attach event listeners to editor events without breaking CM6's event dispatch model. Using `posAtCoords` at `mousedown` time (not `click`) gives the position before CM6 potentially moves the cursor, ensuring the mapping is consistent. Lifting state to the layout keeps the editor and preview decoupled — neither component knows about the other.

**Scroll position on re-render**: After each render the preview's `scrollTop` is preserved explicitly (stored before `innerHTML` update, restored after) so re-renders do not scroll the panel.
