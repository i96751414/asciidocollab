# Contract: `continueList` Enter Command

The editor's externally-observable interface for this feature is a single CodeMirror 6
keymap command bound to **Enter**. This document is the behavioral contract that the tests
verify. There is no HTTP/API surface.

## Registration contract

- Exported from `apps/web/src/lib/codemirror/asciidoc-list-continuation.ts` as a
  CodeMirror `Extension` (a `keymap.of([{ key: 'Enter', run: continueList }])` wrapped in
  `Prec.high`).
- Registered in `use-editor-mount.ts` **before** `defaultKeymap` precedence so it is
  consulted first.
- MUST coexist with `defaultKeymap`, `historyKeymap`/`yUndoManagerKeymap`, and
  `searchKeymap` without altering their behavior on non-list lines.

## Command signature

```
continueList(view: EditorView): boolean
```

- Returns `true` ⇒ the keystroke is consumed; the command has dispatched exactly one
  transaction (Continue or Exit).
- Returns `false` ⇒ not handled; CodeMirror proceeds to the next Enter binding (plain
  newline).

## Behavioral guarantees

### G1 — Continue (non-empty recognized item)
**Given** the cursor is within a recognized list item with content
**When** Enter is pressed
**Then** one transaction inserts `\n` + the current item's leading indentation + the
continued marker + one space, the cursor lands immediately after the inserted marker, and
the command returns `true`.
- Unordered reuses the same marker char and `*`-depth (FR-002).
- Dash `-` items reuse `- ` (not `* `).
- Ordered implicit reuses the same `.`-depth; explicit `n.` emits `(n+1).` (FR-003).
- Checklist reuses the same marker — `*`s **or** `-` — with an **unchecked** `[ ]`,
  regardless of source state (FR-004).
- Description re-emits the same separator — `::`/`:::`/`::::` **or** `;;` — plus a space at
  the same indent, cursor after the separator (symmetric with `* `/`. `); a bare term
  (`CPU::`, no inline definition) continues rather than exits, and a separator-only line
  (`:: `) is the empty item that the next Enter removes (FR-005/FR-006, D4).

### G2 — Split mid-content
**Given** the cursor is between characters of an item's content
**When** Enter is pressed
**Then** text after the cursor moves into the newly continued item (same transaction);
text before the cursor stays in the original item (FR-007).

### G3 — Exit on empty item
**Given** the cursor is on an empty item (marker — plus empty checkbox / description
separator where applicable — and only whitespace)
**When** Enter is pressed
**Then** one transaction removes the marker, leaving an ordinary empty line at the original
indentation; the command returns `true` (FR-006). Trailing whitespace after the marker and
a checkbox-only line both count as empty.

### G4 — Replace selection then continue
**Given** a non-empty selection inside a list item
**When** Enter is pressed
**Then** the selection is replaced first, then continuation applies, in one transaction
(FR-012).

### G5 — Fall through off-list
**Given** the cursor is on a non-list line
**When** Enter is pressed
**Then** the command returns `false` and a plain newline is inserted; behavior is identical
to today (FR-011).

### G6 — Suppress in verbatim/delimited blocks
**Given** the cursor is inside a listing/literal/passthrough/comment/table block where a
leading `*` or `.` is literal text
**When** Enter is pressed
**Then** the command returns `false` (plain newline); no marker is inserted (FR-008).

### G7 — Single-step undo
**Given** any Continue (G1/G2/G4) or Exit (G3) has just occurred
**When** the user issues a single undo (native history on the REST path, `Y.UndoManager` on
the collab path)
**Then** the document and selection return exactly to the pre-Enter state in one step
(FR-010).

### G8 — No semantic/rendered change
The command changes only editor **source** characters (the marker it inserts or removes).
It MUST NOT alter preview/rendered output or content semantics beyond those characters
(FR-009).

## Non-goals (out of contract)

- Renumbering existing explicit-ordered items below the insertion point.
- Auto-continuation triggered by paste or non-Enter newline insertion.
- Roman/alpha explicit numbering styles (`a.`, `A.`, `i.`, `I.`) and callout lists (`<1>`, `<.>`).
