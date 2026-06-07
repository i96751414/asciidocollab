# Hook Contracts: AsciiDoc Live Preview with Source Sync

## `useAsciidocPreview(options)`

Manages the Web Worker lifecycle, debounce timer, PreviewState machine, and click-to-scroll.

### Options

| Prop          | Type                        | Required | Description                                                                                             |
|---------------|-----------------------------|----------|---------------------------------------------------------------------------------------------------------|
| `content`     | `string`                    | Yes      | Current AsciiDoc source text. Changing this resets the debounce and transitions state to `'pending'`.   |
| `isEnabled`   | `boolean`                   | Yes      | `true` when the selected file is AsciiDoc and the preview panel is open. `false` transitions to `'idle'`. |
| `scrollToLine`| `number \| null`             | No       | When set, the hook scrolls the preview to the element with `data-source-line="${scrollToLine}"`. Scroll position is otherwise preserved across re-renders. |

### Returns

| Field          | Type                        | Description                                                                                    |
|----------------|-----------------------------|------------------------------------------------------------------------------------------------|
| `html`         | `string \| null`            | Latest successfully rendered HTML, or `null` before the first successful render.              |
| `state`        | `PreviewState`              | Current lifecycle state (`'idle' \| 'pending' \| 'rendering' \| 'up-to-date' \| 'error'`).   |
| `error`        | `string \| null`            | Error message from the last failed render, or `null`.                                         |
| `previewRef`   | `React.RefObject<HTMLDivElement>` | Ref to attach to the preview scroll container. Used internally for scroll management.    |

### Behaviour

- Creates one `Worker` instance on mount; terminates it on unmount.
- Debounce duration read from `NEXT_PUBLIC_PREVIEW_DEBOUNCE_MS` (default 1500 ms).
- Each content change resets the debounce timer and sets state to `'pending'`.
- On debounce fire: increments `requestId`, posts `RenderRequest` to worker, sets state to `'rendering'`.
- On worker message: if `result.requestId === currentRequestId`, updates `html` and transitions to `'up-to-date'` or `'error'`. Stale messages (mismatched `requestId`) are silently discarded.
- On each HTML update: saves `previewRef.current.scrollTop` before setting `innerHTML`, restores it after, preserving the author's scroll position.
- When `scrollToLine` changes (non-null): calls `querySelector('[data-source-line="${scrollToLine}"]')` on `previewRef.current` and `scrollIntoView({ behavior: 'smooth', block: 'start' })`. Falls back to the nearest element with `data-source-line` value ≤ `scrollToLine`.

---

## `useEditorMount` (extended)

The existing hook gains one new option and one new return value to support click tracking.

### New option

| Prop          | Type                        | Required | Description                                             |
|---------------|-----------------------------|----------|---------------------------------------------------------|
| `onLineClick` | `(line: number) => void`    | No       | Called with the 1-based line number when the author clicks in the editor. |

### Implementation note

Registers a CodeMirror `domEventHandlers` extension on `mousedown`. Uses `view.posAtCoords({ x: event.clientX, y: event.clientY })` to get the document offset, then `view.state.doc.lineAt(pos).number` for the line number. Calls `onLineClick(lineNumber)` if the prop is provided.

---

## Resize layout

No `usePreviewResize` hook is introduced. `ProjectEditorLayout` uses `react-resizable-panels` (`PanelGroup`, `Panel`, `PanelResizeHandle`) directly. The library manages panel sizes internally; no external state accessor is needed because the split ratio is session-only and never read back by other components. Default split: 50 / 50. Minimum per panel: 20 %. Not persisted across page loads.
