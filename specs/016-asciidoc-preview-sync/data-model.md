# Data Model: AsciiDoc Live Preview with Source Sync

## Frontend State

### PreviewState (union)

The current lifecycle state of the preview panel. Used by the sync indicator.

```
'idle'        — no file selected, or selected file is not AsciiDoc
'pending'     — content has changed; debounce timer is running
'rendering'   — message sent to worker; waiting for result
'up-to-date'  — last render succeeded and preview matches current content
'error'       — last render failed; previous HTML retained
```

Transitions:

```
idle       → pending     (AsciiDoc file selected, content received)
pending    → pending     (more content changes reset the debounce timer)
pending    → rendering   (debounce fires; message sent to worker)
rendering  → up-to-date (worker returns success result)
rendering  → error      (worker returns error result)
up-to-date → pending    (content changes)
error      → pending    (content changes)
any        → idle       (non-AsciiDoc file selected, or panel unmounts)
```

---

### RenderRequest (worker input message)

Sent from the preview hook to the Web Worker on each render trigger.

| Field       | Type     | Description                                                                                    |
|-------------|----------|------------------------------------------------------------------------------------------------|
| `requestId` | `number` | Monotonically increasing integer. The worker echoes this back; stale responses are discarded.  |
| `content`   | `string` | Full AsciiDoc source text to render.                                                           |

---

### RenderResult (worker output message)

Returned by the Web Worker after each render attempt.

| Field       | Type                  | Description                                                                            |
|-------------|-----------------------|----------------------------------------------------------------------------------------|
| `requestId` | `number`              | Echoed from the request; allows the consumer to detect and discard stale renders.      |
| `ok`        | `boolean`             | `true` if render succeeded; `false` if Asciidoctor threw.                              |
| `html`      | `string \| null`      | Rendered HTML with `data-source-line` attributes injected. `null` on failure.          |
| `error`     | `string \| null`      | Human-readable error message from Asciidoctor. `null` on success.                      |

---

### ResizeSplit (UI state in ProjectEditorLayout)

Tracks the current width distribution between editor and preview panels. Not persisted.

| Field          | Type     | Description                                                                  |
|----------------|----------|------------------------------------------------------------------------------|
| `editorPct`    | `number` | Editor panel width as a percentage of the combined editor+preview area. Default: 50. |
| `previewPct`   | `number` | Preview panel width as a percentage. Default: 50. `editorPct + previewPct === 100`. |
| `minPct`       | `number` | Minimum allowed percentage for either panel. Constant: 20.                   |

---

## HTML Output Convention

### `data-source-line` attribute

Every block-level HTML element produced by the Asciidoctor TreeProcessor extension carries a `data-source-line` attribute whose value is the 1-based line number of the corresponding block in the AsciiDoc source.

Examples in generated HTML:

```html
<h2 id="_section_title" data-source-line="5">Section Title</h2>

<div class="listingblock" data-source-line="12">
  <div class="content"><pre class="highlight">...</pre></div>
</div>

<table class="tableblock" data-source-line="30">...</table>

<div class="admonitionblock note" data-source-line="45">...</div>
```

**Lookup at click time**: `previewRoot.querySelector('[data-source-line="${lineNumber}"]')` — if no exact match, fall back to the element with the largest `data-source-line` value less than `lineNumber` (nearest block above the click).

---

## CSS Scope Convention

The preview stylesheet (`asciidoc-preview.css`) applies exclusively inside elements with the class `.asciidoc-preview-content`. This prevents styles from leaking into the surrounding application UI.

```html
<div class="asciidoc-preview-content">
  <!-- Asciidoctor HTML output injected here -->
</div>
```
