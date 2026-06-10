# Quickstart: AsciiDoc List Auto-Continuation

Front-end-only feature in `apps/web`. No server, schema, or env changes.

## What you're building

An **Enter** keymap command in the CodeMirror editor that continues AsciiDoc lists
(unordered, ordered, checklist, description) and exits on an empty item — in a single,
undoable step — while leaving every non-list line untouched.

## Files

| File | Role |
|------|------|
| `apps/web/src/lib/codemirror/asciidoc-list-item.ts` | **New, pure.** `parseListMarker(line): ListMarker \| null`. No CodeMirror imports. |
| `apps/web/src/lib/codemirror/asciidoc-list-continuation.ts` | **New.** `continueList(view)` command + exported `Prec.high` keymap extension. Owns selection, syntax-tree block suppression, single-transaction dispatch. |
| `apps/web/src/hooks/use-editor-mount.ts` | **Modified.** Add the extension to the `extensions` array (higher precedence than `defaultKeymap`). |
| `apps/web/src/lib/codemirror/asciidoc.grammar` + `asciidoc-block-tokens.ts` + `asciidoc-language.ts` | **Modified.** Add literal `....` (`LiteralBlock`, FR-008), explicit-ordered `1.`, dash checklist `- [ ]`, and `;;` description tokens; regenerate `asciidoc-parser.js`. Keeps highlighting in lockstep with continuation. |
| `apps/web/tests/lib/codemirror/asciidoc-list-item.test.ts` | **New.** Pure-parser unit tests (`node` Jest project). |
| `apps/web/tests/lib/codemirror/asciidoc-list-continuation.test.tsx` | **New.** Command behavior vs a real `EditorView` (`jsdom` Jest project). |
| `apps/web/tests/lib/codemirror/asciidoc-grammar.test.ts` + `tests/helpers/asciidoc-test-tokenizer.ts` | **Modified.** Grammar cases for the new tokens; mirror tokenizer logic. |
| `apps/web/tests/lib/codemirror/asciidoc-highlight.test.ts` | **New.** Highlight-consistency: each new construct's class matches its existing sibling (`1.`≈`.`, `- [ ]`≈`* [ ]`, `;;`≈`::`, `....`≈`----`). Authoritative colors are in `asciidoc-theme.ts` (wins at `Prec.highest`). |

## TDD loop (Constitution II — NON-NEGOTIABLE)

1. **Red — parser.** Write `asciidoc-list-item.test.ts` cases for every marker family,
   nesting depth, empty-item, explicit-number, indentation, and non-list negatives. Run,
   confirm failure.
2. **Green — parser.** Implement `parseListMarker` until green.
3. **Red — command.** Write `asciidoc-list-continuation.test.tsx` driving the `Enter`
   binding on a real `EditorState`, asserting resulting `doc`/`selection` for each
   acceptance scenario in [contracts/enter-command.md](./contracts/enter-command.md), plus
   single-undo (G7) and verbatim-suppression (G6). Run, confirm failure.
4. **Green — command.** Implement `continueList` + wire it into `use-editor-mount.ts` until
   green.
5. **Refactor.** Tidy with tests green. Commit only on green.

## Run the gates

```bash
# Fast pure-parser tests (node project)
pnpm --filter @asciidocollab/web exec jest asciidoc-list-item

# Command behavior (jsdom project)
pnpm --filter @asciidocollab/web exec jest asciidoc-list-continuation

# Full web suite + coverage (note: use `exec jest --coverage`, not `test -- --coverage`)
pnpm --filter @asciidocollab/web exec jest --coverage

# Repo-wide gates
pnpm lint
pnpm typecheck
```

## Manual smoke check

1. `pnpm --filter @asciidocollab/web dev`, open a document in the editor.
2. Type `* first`, press Enter → new line begins `* `, cursor after it.
3. Type `second`, press Enter twice → trailing empty bullet removed, plain blank line.
4. Try `- a`, `. a`, `1. a`, `* [x] done`, `- [x] done`, `CPU:: brain`, `Term;; def`, bare
   `CPU::` — each continues with the right marker (checkbox resets to `[ ]` keeping `*`/`-`,
   explicit number increments, description re-emits `:: `/`;; `, bare term continues). Confirm
   `1. a` is also **highlighted** as an ordered list item. On the resulting `:: ` line press
   Enter again → separator removed (exit).
5. Inside a `----` listing block AND a `....` literal block, type `* x` and press Enter →
   plain newline, **no** marker (ancestor-walk suppression).
6. After any continuation, press Ctrl/Cmd-Z once → returns to the exact pre-Enter state.

## Watch-outs

- Register the command at **higher precedence than `defaultKeymap`**, or the default Enter
  wins and nothing continues.
- Dispatch **one** transaction per Enter, or undo becomes two steps (FR-010).
- Checklist continuation must force `[ ]` even from `[x]`, preserving the `*`/`-` marker (FR-004).
- Description continuation re-emits the separator + space (`:: `, `;; `) with the cursor after
  it — symmetric with `* `/`. `; a bare `term::` continues; a separator-only `:: ` line is the
  empty item that the next Enter removes (exit) — see research D4.
- Block suppression walks syntax-tree **ancestors** (the marker line's direct node inside a
  verbatim block is an internal error node; the enclosing `ListingBlock`/`LiteralBlock`/etc.
  is its ancestor). `LiteralBlock` (`....`) is added by this feature.
- Each grammar token addition needs a parser regenerate (`lezer-generator`) and a matching
  update to the test tokenizer helper, or the grammar test can't tokenize it.
