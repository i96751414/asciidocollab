# Contract: Preview Style UI

## Shared control — `PreviewStyleControl`

A compact shadcn control (segmented control or two-option `Select`) bound to a single
preference. Rendered in two places; both read/write `useEditorPreferences().previewStyle`.

| Aspect | Contract |
|--------|----------|
| Props | `value: 'asciidocollab' \| 'asciidoctor'`, `onChange: (v) => void`, optional `compact` for the header variant |
| Options | token `asciidocollab` → label "Asciidocollab"; token `asciidoctor` → label "Asciidoctor" (labels are display-only, never stored) |
| a11y | `role="group"` / labelled control; each option exposes pressed/selected state; keyboard operable |
| Active indication | the current value is visibly marked (FR-003) |

## Preview header (`asciidoc-preview.tsx`)

- The control sits in the existing header row (`flex items-center gap-1`) alongside the
  sync indicator, scroll-sync toggle, and collapse button.
- Selecting an option calls `setPreviewStyle(v)` and the content element's
  `data-preview-style` flips in the same render — **no page reload, no re-fetch, document
  source untouched** (FR-004, FR-012).

## Settings (`editor-preferences-card.tsx`)

- A new labelled "Preview Style" row using the same `PreviewStyleControl`.
- Changing it here updates the header control and vice versa (FR-006).

## Preview content element

```html
<div class="asciidoc-preview-content" data-preview-style="asciidocollab | asciidoctor" ...>
```

- `data-preview-style` is present on first paint (seeded from localStorage) — no flash (FR-016).
- `asciidocollab` (or attribute absent): existing token-driven CSS, follows light/dark.
- `asciidoctor`: the generated scoped stylesheet applies; surface is fixed-light regardless
  of app dark mode; **no styling escapes `.asciidoc-preview-content`** (FR-010, SC-005).

## Component/e2e test contract

- Switching in the header visibly changes the rendered preview; editor source unchanged (US1).
- Reload re-applies the saved style with no flash of default (US2, SC-008).
- In app dark mode: `asciidocollab` renders dark, `asciidoctor` renders light & legible;
  app chrome unchanged in both (US3).
- Header and settings controls stay in sync (FR-006).
- Both styles render admonitions, code blocks, tables, and all four list types (SC-004).
