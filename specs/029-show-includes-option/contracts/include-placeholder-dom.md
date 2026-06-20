# Contract: Include Placeholder DOM, Styling & Interaction

## DOM shape (post-sanitization)

The assembler emits (via Asciidoctor passthrough) one element per hidden top-level include:

```html
<div class="adoc-include-placeholder"
     data-include-target="parts/chapter1.adoc"
     role="button"
     tabindex="0">included: parts/chapter1.adoc</div>
```

- `data-include-target` = sandbox-resolved project-relative path, or the raw target when unresolvable. HTML-escaped (`& < > " '`).
- Visible text references the same (escaped) target so the writer can identify what is hidden (FR-003a).
- MUST survive `DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })` **unchanged** (no sanitizer config change): `<div>`, `class`, `data-*`, `role`, `tabindex` are all retained by default.
- Receives `data-source-line` from the worker's existing pass (block has a source location), preserving scroll-sync (Constitution VIII).

## Styling (apps/web/src/styles/asciidoc-preview.css)

- A single rule scoped under `.asciidoc-preview-content` (the preview content surface). Subtle, non-intrusive (muted color, small inset/border, not competing with body content — FR-003a). MUST NOT affect app chrome (Constitution VI).
- Cursor `pointer`; a visible focus ring for keyboard users (`:focus-visible`).

## Interaction (apps/web/src/components/asciidoc-preview.tsx)

- New optional prop `onOpenInclude?: (path: string) => void`.
- A single delegated listener on the output container handles:
  - `click` on (or within) `.adoc-include-placeholder[data-include-target]` → `onOpenInclude(target)`.
  - `keydown` Enter/Space on a focused placeholder → same, with `preventDefault`.
- The handler reads `data-include-target` (already sandbox-resolved); it performs no path computation itself.
- Wiring (project-editor-layout.tsx): `onOpenInclude={handleNavigateToFile}` (existing path→file-tree navigation). Unresolvable/not-in-tree target ⇒ navigation no-ops (FR-003b).

## Props delta

```ts
interface AsciiDocPreviewProperties {
  // …existing…
  showIncludedFiles?: boolean;            // default false; passed to useAsciidocPreview as showIncludes
  onOpenInclude?: (path: string) => void; // placeholder activation → open file
}
```

The header renders the new `ShowIncludesControl` bound to `showIncludedFiles` + its setter (FR-007).

## Test obligations (red-first)

- Component test: clicking a `.adoc-include-placeholder` calls `onOpenInclude` with the `data-include-target` value; Enter/Space on focus does too.
- Component/DOM test: a placeholder element passed through the sanitizer retains `class`/`data-include-target`/`role`/`tabindex` (guards Constitution VIII assumption).
- Control test: toggling `ShowIncludesControl` calls the setter; reflects `aria-pressed`.
- Styling/scoping: placeholder rule lives under `.asciidoc-preview-content` (no chrome leakage).
