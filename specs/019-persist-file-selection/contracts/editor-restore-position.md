# Contract: Editor Cursor Restore & Reporting

Covers the two editor-facing seams: reporting the cursor line up, and restoring an initial line on mount. Touches `apps/web/src/components/editor/asciidoc-editor.tsx` and `apps/web/src/hooks/use-editor-mount.ts`.

## New props on `AsciiDocEditor`

```ts
interface AsciiDocEditorProps {
  // ...existing props...
  /** 1-based line to place the cursor on when this editor instance mounts (restore). */
  initialLine?: number;
  /** Called (debounced by the caller) with the 1-based cursor line as it changes. */
  onCursorLineChange?: (line: number) => void;
}
```

`useEditorMount` gains a matching optional `initialLine` input.

## Behavioral contract

| # | Given | When | Then |
|---|-------|------|------|
| E1 | `initialLine = 42`, document has ≥ 42 lines | editor mounts | cursor is placed at the start of line 42 and the line is scrolled into view |
| E2 | `initialLine = 1000`, document has 120 lines | editor mounts | cursor is placed on line 120 (clamped to last line) — "closest valid line"; no error |
| E3 | `initialLine` < 1 or not provided | editor mounts | cursor stays at the default (line 1); no scroll jump |
| E4 | editor is non-AsciiDoc (binary/image) | n/a | `AsciiDocEditor` is not rendered for binary; `initialLine` is only ever passed for AsciiDoc files |
| E5 | user moves the cursor | selection changes | `onCursorLineChange(line)` fires with the 1-based line |
| E6 | `onCursorLineChange` not provided | cursor moves | no error (callback optional) |
| E7 | `initialLine` provided | user later moves cursor | the initial jump does **not** re-fire on subsequent renders (applied once on mount) |

## Clamp rule

```
targetLine = min(max(initialLine, 1), view.state.doc.lines)
```

Applied at apply-time against the **current** document, implementing FR-005's "closest still-valid line".

## Restore-once rule (caller side — `ProjectEditorLayout`)

`initialLine` is supplied **only** for the first auto-selection performed during restoration on mount (guarded by a one-shot ref). In-session file clicks pass `initialLine = undefined`. See research Decision 4.

## Requirements traceability

- FR-004 / FR-008 → E5 (line reported up for persistence)
- FR-005 → E1, E2 (restore + clamp + scroll into view)
- FR-006 → E4 (line only for AsciiDoc)
- US2 scenarios 1–2 → E1, E2
