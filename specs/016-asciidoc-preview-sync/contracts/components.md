# Component Contracts: AsciiDoc Live Preview with Source Sync

## `AsciiDocPreview` (rewrite)

Replaces the existing `asciidoc-preview.tsx`. Renders the styled HTML preview and sync state indicator.

### Props

| Prop          | Type                     | Required | Description                                                                                           |
|---------------|--------------------------|----------|-------------------------------------------------------------------------------------------------------|
| `content`     | `string`                 | Yes      | Current AsciiDoc source text. Passed to `useAsciidocPreview`.                                        |
| `isEnabled`   | `boolean`                | Yes      | `true` when the file is AsciiDoc and the panel is open.                                              |
| `scrollToLine`| `number \| null`          | No       | Line number to scroll the preview to when set. Comes from the editor click event in the layout.       |

### Rendered structure

```
<div class="flex flex-col h-full">
  <PreviewHeader>          ← "Preview" label + sync state indicator
  <div ref={previewRef}>   ← scrollable content area
    <div class="asciidoc-preview-content">   ← PDF-like CSS scope
      {dangerouslySetInnerHTML: html}
    </div>
  </div>
</div>
```

### Sync state indicator

Displayed in the panel header. Maps `PreviewState` → UI:

| State        | Indicator                          |
|--------------|------------------------------------|
| `idle`       | "–" (muted)                        |
| `pending`    | "●" animated pulse (muted)         |
| `rendering`  | spinner icon (muted)               |
| `up-to-date` | "✓" (green)                        |
| `error`      | "⚠ Preview error" (destructive) + tooltip with `error` message |

---

## `ProjectEditorLayout` (updated)

Replaces the fixed-width flex layout with a resizable split between editor and preview.

### Key structural changes

- File tree panel: unchanged — fixed width `w-64`, collapsible. Not part of the resizable group.
- Editor + Preview: wrapped in a `PanelGroup direction="horizontal"` from `react-resizable-panels`.
  - `Panel` (editor): default size 50, minSize 20.
  - `PanelResizeHandle`: a visible drag handle between the two panels.
  - `Panel` (preview): default size 50, minSize 20. Only rendered when `showPreview` is true.
- When preview is collapsed (not shown), the editor panel expands to fill the space — the resize handle is hidden.
- `clickedLine` state (`number | null`) held in layout; reset to `null` after the preview hook consumes it.
- Editor wired: `<AsciiDocEditor onLineClick={line => setClickedLine(line)} />`
- Preview wired: `<AsciiDocPreview scrollToLine={clickedLine} />`

---

## `AsciiDocEditor` (minor update)

### New prop

| Prop          | Type                     | Required | Description                                               |
|---------------|--------------------------|----------|-----------------------------------------------------------|
| `onLineClick` | `(line: number) => void` | No       | Forwarded to `useEditorMount`. Called on editor mousedown. |
