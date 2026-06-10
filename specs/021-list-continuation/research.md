# Phase 0 Research: AsciiDoc List Auto-Continuation

All Technical Context unknowns are resolved below. Each entry records the Decision, the
Rationale, and the Alternatives considered.

---

## D1 — How to intercept Enter

**Decision**: Add a CodeMirror 6 keymap binding `{ key: 'Enter', run: continueList }` wrapped
in `Prec.high(...)`, registered in the `use-editor-mount.ts` extensions array. The command
returns `true` when it handles continuation or list-exit (consuming the keystroke) and
`false` otherwise, letting `defaultKeymap`'s `insertNewlineAndIndent` run for every
non-list line.

**Rationale**: `Prec.high` guarantees the binding is consulted before `defaultKeymap`. The
true/false return is CodeMirror's standard command protocol for "handled / fall through,"
giving us FR-011 (unchanged plain-newline off-list) for free with no branching in the
default path. Keymaps compose cleanly with the existing `defaultKeymap`/`searchKeymap`
arrays.

**Alternatives considered**:
- `EditorView.domEventHandlers({ keydown })` — rejected: must re-implement
  modifier/IME/`preventDefault` handling that the keymap facet already does correctly, and
  ordering versus other keydown handlers is murkier than facet precedence.
- A `transactionFilter` rewriting newline insertions — rejected: opaque, fires for
  programmatic/remote inserts too, and is far harder to scope to "user pressed Enter."

---

## D2 — Where list-marker parsing lives

**Decision**: A pure module `asciidoc-list-item.ts` exporting `parseListMarker(lineText:
string): ListMarker | null` with **no CodeMirror imports**. It recognizes the four marker
families and returns a typed descriptor (kind, marker string, depth, indentation,
content-start offset, emptiness, and for ordered explicit lists the parsed number).

**Rationale**: Keeps business rules (what is a list marker, what counts as empty, how a
checkbox resets) testable as plain string→object cases in the fast `node` Jest project,
honoring Constitution II/I (small pure functions, exhaustive red tests, no infra coupling).
The CodeMirror command stays thin. Marker grammar mirrors the existing
`asciidoc-block-tokens.ts` tokenizer so the editor's highlighting and continuation agree on
what a list item is.

**Alternatives considered**:
- Parse via the Lezer `syntaxTree` node under the cursor — rejected as the *primary*
  marker source: the tree can be incrementally stale right at the caret mid-keystroke, node
  boundaries don't directly give us the marker string to re-emit, and it drags CodeMirror
  into the unit tests. (The syntax tree is still used, but only for block suppression — see
  D5.)

---

## D3 — Marker syntaxes recognized and re-emitted

**Decision**: Cover Asciidoctor's full common list marker set:

| Kind | Recognized | Continued marker | Empty test |
|------|-----------|------------------|------------|
| Unordered | `*`…`*` or single `-`, then a space | same char, same count + space | only marker + ws |
| Checklist | `*`…`*` **or** `-` + ` [ ]`/`[x]`/`[X]` + space | same marker + ` [ ] ` (always unchecked) | only marker+box+ws |
| Ordered (implicit) | `.`…`.` then space | same dots + space | only marker + ws |
| Ordered (explicit) | digits + `.` then space (depth-1 only) | `(n+1).` + space | only marker + ws |
| Description | `term` + `::`/`:::`/`::::`/`;;` (optionally trailing value) | same separator level at same indent | continued line empty |

Indentation = the run of leading spaces/tabs before the marker, preserved verbatim
(FR-013).

**Grammar tokenization (decided after the AsciiDoc-syntax review):**
- **Explicit-number ordered (`1.`)** — the existing grammar tokenizes only `.`-runs, so `1.`
  lines were continued (by the pure parser) but **not** syntax-highlighted as lists. We add
  `\d+\.` to the block tokenizer's `orderedMarker` so highlight and continuation agree.
- **Dash checklist (`- [ ]`)** — the grammar's `checklistMarker` was `*`-only; we extend it to
  accept the `-` marker too (Asciidoctor supports both).
- **`;;` description** — the grammar's `descListToken` handled colon runs only; we add `;;` as
  a fourth term separator.

These three are small tokenizer additions paralleling the `literalDelim` change (D5), each
with a grammar test. They keep the editor's highlighting and the continuation behavior in
lockstep (no behavior/highlight divergence).

**Rationale**: Reusing the tokenizer's exact rules (e.g. `- ` requires a following space,
`*`-depth = star count, checkbox is the bracket triplet) keeps continuation consistent with
how the document is highlighted and parsed, and directly satisfies FR-002…FR-005.
Explicit-number renumbering of *following* items is out of scope per the spec's Assumptions;
we only emit the next number for the new item.

**Alternatives considered**:
- Supporting roman/alpha explicit numbering (`a.`, `A.`, `i.`, `I.`) and callout lists
  (`<1>`, `<.>`) — deferred and recorded as out of scope in spec.md: not core to the reported
  friction; implicit `.` and explicit `1.` cover ordered needs.
- Leaving explicit `1.` continued-but-unhighlighted — rejected: the behavior/highlight
  divergence is confusing, and the grammar fix is cheap.

---

## D4 — Description-list continuation shape

**Decision** (settled in the AsciiDoc-syntax review): treat the term **separator** as the
list marker and continue/exit **symmetrically** with the other list types. On Enter at the
end of a description item (e.g. `CPU:: The brain`), insert a newline + the same leading
indentation + the separator + one space (`:: `, `::: `, `;; `, …), placing the cursor after
it. A line that is **only** the separator (plus optional whitespace) is an empty item: the
next Enter removes it and exits, leaving an ordinary blank indented line — exactly as `* ` →
exit works for unordered lists.

A **bare term** line (term present, separator, no inline definition — e.g. `CPU::`, the
definition following on later lines) is a **normal** item (term is non-empty), so Enter
continues it (emits `:: `). Only the separator-only line counts as empty.

**Rationale**: Chosen for **consistency** — description lists now obey the same
continue-then-exit-on-empty mechanic as `*`/`-`/`.`/checklist items, so FR-006 has one
uniform rule and the data-model's `isEmpty`→Exit path is reachable for all four types. This
resolves the inconsistency where a separator-less continuation left nothing to remove on
exit.

**Accepted trade-off**: AsciiDoc places the term *before* the separator, so a pre-inserted
`:: ` line (separator-before-term) is not idiomatic until the user types a term ahead of it.
This awkwardness was explicitly accepted in favor of behavioral symmetry across list types;
the transient `:: ` line is the empty item the user either fills in (typing the next
term/definition) or clears with a second Enter.

**Alternatives considered**:
- Separator-less blank-line continuation (the earlier draft) — rejected: produced an
  unreachable description `isEmpty`/Exit path (a blank line is non-list → fall-through), so
  "exit removes the separator" had nothing to remove, contradicting FR-006 / US4.
- Duplicate the whole `term::` — rejected: copying the previous term is rarely what the
  author wants for the *next* entry.

**Parser consequence**: `parseListMarker` must recognize a **separator-only** line
(`^(\s*)(:{2,4}|;;)\s*$`) as an empty description item (`isEmpty = true`), in addition to the
`term + separator` form. The grammar's `descListToken` still requires a term, so the
transient `:: ` line is not separately highlighted — acceptable for a momentary editing
state.

---

## D5 — Suppressing continuation inside verbatim / delimited blocks (FR-008)

**Decision**: Before treating a line as a list item, consult the Lezer `syntaxTree(state)`
at the cursor: if the caret is inside a verbatim/delimited region — listing (`----`),
**literal (`....`)**, passthrough (`++++`), comment (`////`), or table — the command
returns `false` (plain newline). Implementation walks the resolved node ancestry / nearest
enclosing delimiter node for those block kinds.

Because the current grammar does **not** tokenize the literal `....` block, this feature
**adds a `literalDelim` external token** so FR-008's explicit literal-block case (spec edge
case L83) is met rather than accepted as a limitation. The addition is small and mirrors
the existing `listingDelim` (`----`) handling:

- `asciidoc.grammar`: declare `literalDelim` in the `@external tokens` list, add a
  `LiteralBlock { literalDelim blockBody literalDelim }` rule, and add `LiteralBlock` to the
  `block` alternation.
- `asciidoc-block-tokens.ts`: in the existing `.`/`DOT` branch, before the `orderedMarker`
  check, emit `literalDelim` when there are ≥ 4 dots and the rest of the line is empty
  (`afterDots === NEWLINE || -1`) — exactly the shape used for `----`/`====`/etc. Import the
  new `literalDelim` term.
- Regenerate `asciidoc-parser.js`/`asciidoc-parser.terms.js` via the existing
  `lezer-generator` step (`predev`/`prebuild` already run it).
- `asciidoc-language.ts`: map `LiteralBlock: t.content` (same tag family as `ListingBlock`).

**Rationale**: The grammar already tokenizes the other delimiters
(`listingDelim`, `passthroughDelim`, `commentBlockDelim`, `tableDelim`, …), so the tree is
the authoritative "am I in literal text" signal and avoids a second hand-rolled
block-state scanner. Adding `literalDelim` keeps the continuation command's block-suppression
logic uniform — it checks node names, and `LiteralBlock` simply joins the verbatim set —
rather than special-casing `....` outside the tree.

**Alternatives considered**:
- Leave `....` untokenized and document the gap — rejected (per F1 decision): spec FR-008 /
  edge case names literal blocks as a MUST-NOT-continue case; the grammar addition is cheap
  and removes the gap entirely.
- Scan upward from the cursor counting block delimiters by hand — rejected: duplicates
  tokenizer logic, easy to drift, and must re-handle nesting the tree already models.
- Ignore block context — rejected: directly violates FR-008 / SC-004 (false continuations
  inside code blocks).

---

## D6 — Single-step undo on both editor paths (FR-010)

**Decision**: The command performs all edits (selection replacement, newline, marker
insert, or marker removal on exit) in **one** `view.dispatch(...)` transaction, tagged with
`userEvent: 'input'` (continuation) / `'delete'` (exit). One transaction ⇒ one undo step.

**Rationale**: On the REST path, native `history()` records per transaction. On the collab
path, native history is omitted and `Y.UndoManager` (empty `trackedOrigins`, local origin
auto-added) groups by the synchronously-applied change of a single transaction. A single
dispatch therefore yields a single undo on both paths without special-casing. Verified by
research into the existing `editor-collab-extensions.ts` setup (D10 of feature 020).

**Alternatives considered**:
- Two dispatches (newline, then marker) — rejected: risks a two-step undo and an
  intermediate observable state.
- Forcing `addToHistory`/isolate annotations — unnecessary once everything is one
  transaction; avoids coupling to history internals.

---

## D7 — Empty-item exit semantics (FR-006)

**Decision**: When `parseListMarker` reports the current item is empty (marker — plus an
empty checkbox or description separator where applicable — and only whitespace, no other
content), Enter replaces the item's marker region with nothing, leaving an ordinary empty
line at the item's original indentation, and the command returns `true`. Trailing
whitespace after the marker (`*   `) and a checkbox-only line (`* [ ]`) both count as empty
(spec Edge Cases).

**Rationale**: Implements "one keystroke exits the list" (SC-002) and matches the
acceptance scenarios for every list type. Keeping the indentation gives the natural blank
line the author expects to keep typing prose at the list's indent.

**Alternatives considered**:
- Remove the whole line including indentation — rejected: loses alignment context the user
  may want; spec says "ordinary empty line at the appropriate indentation."

---

## D8 — Selection and mid-line behavior (FR-007, FR-012)

**Decision**: The command reads `state.selection.main`. If non-empty, the transaction's
change replaces the selection range, then continuation text is inserted at the (collapsed)
head — i.e. replace-then-continue in one transaction. For a collapsed cursor mid-content,
the inserted newline+marker naturally splits the line, moving the after-cursor text into
the new item (CodeMirror's change model handles this since we insert at the cursor offset).

**Rationale**: Mirrors standard typing (selection replaced first) and yields the spec's
`* Hello ` / `* world` split for free, satisfying FR-007 and FR-012 with the same code
path.

**Alternatives considered**:
- Special mid-line branch — unnecessary: inserting `\n<marker>` at the cursor already
  splits content correctly.

---

## D9 — Test strategy

**Decision**: Two test files. (1) `asciidoc-list-item.test.ts` (node project): pure
parser, one assertion group per marker family + emptiness + explicit-number + indentation
+ "not a list" negatives. (2) `asciidoc-list-continuation.test.tsx` (jsdom project):
construct a real `EditorState` with the command + `defaultKeymap`, drive the `Enter` binding
(invoke the bound command with a real `EditorView`), and assert resulting `doc`/`selection`
for each acceptance scenario, plus a single-undo assertion (dispatch, undo, compare to
pre-state) and a verbatim-block negative (cursor inside `----` ⇒ plain newline).

**Rationale**: Matches the existing split between the fast `node` project and DOM-bound
`jsdom` project (`jest.config.cjs`), and the repo's precedent of testing CodeMirror
extensions against real state (`asciidoc-fold`, `asciidoc-outline`). Real-`EditorView`
tests give honest behavioral coverage instead of asserting on a mocked view.

**Alternatives considered**:
- Mock `EditorView` and assert on `dispatch` args only — rejected: brittle and doesn't
  prove the resulting document; the constitution favors honest tests over mocks.
- Playwright E2E for keystrokes — deferred: heavier and slower than needed for
  deterministic command logic; unit/integration coverage is sufficient for this scope.
