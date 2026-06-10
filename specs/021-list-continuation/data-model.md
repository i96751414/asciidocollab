# Phase 1 Data Model: AsciiDoc List Auto-Continuation

This feature persists nothing and defines no domain entity. Its "data model" is the set of
**value objects** the pure parser produces and the command consumes, plus the editor state
it reads. All types live in `apps/web/src/lib/codemirror/asciidoc-list-item.ts` and are
immutable, framework-free, and `readonly`.

---

## Value Object: `ListMarker`

The parsed description of the list item on the current line. `parseListMarker(lineText)`
returns `ListMarker` when the line is a recognized list item, or `null` otherwise.

| Field | Type | Meaning |
|-------|------|---------|
| `kind` | `'unordered' \| 'ordered' \| 'checklist' \| 'description'` | Which marker family matched. |
| `indent` | `string` | Leading whitespace (spaces/tabs) before the marker, preserved verbatim on continuation (FR-013). |
| `marker` | `string` | The exact marker text to reason about (e.g. `**`, `-`, `..`, `1.`, `* [x]`, `- [ ]`, `::`, `;;`). |
| `depth` | `number` | Nesting depth: count of `*`/`.`/`:` units (`;;` is its own level); `1` for `-` and explicit-number ordered. |
| `contentStart` | `number` | Offset within `lineText` where item content begins (after marker + the single separating space). |
| `isEmpty` | `boolean` | `true` when nothing but the marker (and an empty checkbox / description separator) plus whitespace is present → Enter exits the list (FR-006). |
| `ordinal` | `number \| null` | For explicit ordered items (`1.`), the parsed number; `null` for implicit/`*`/`-`/checklist/description. Drives "next number" continuation (FR-003). |

### Validation rules (encoded in the parser)

- **Unordered**: `^(\s*)([*]+|-) ` — for `-`, exactly one dash; for `*`, `depth` = star
  count. `isEmpty` when the remainder is whitespace only.
- **Checklist**: `^(\s*)([*]+|-) \[( |x|X)\] ` — `kind='checklist'`, `marker` includes the
  stars **or** the dash (Asciidoctor allows checkboxes on both `*` and `-` markers);
  continuation always re-emits the same marker + `[ ] ` (unchecked, FR-004). `isEmpty` when
  nothing follows the checkbox but whitespace; a checkbox-only line (`* [ ]` / `- [ ]`) is
  empty.
- **Ordered implicit**: `^(\s*)([.]+) ` — `depth` = dot count, `ordinal=null`.
- **Ordered explicit**: `^(\s*)(\d+)\. ` — `depth=1`, `ordinal` = the number; continuation
  emits `ordinal+1`. (Also tokenized by the grammar so these lines are highlighted as lists,
  not only continued — research D3.)
- **Description** (two forms): a **term** form `^(\s*)(.+?)(:{2,4}|;;)(\s|$)` — `marker` =
  the term separator (`::`/`:::`/`::::`/`;;`), `depth` = separator level, `isEmpty = false`
  (a bare term like `CPU::` still has a term, so it continues, emitting `marker + space`); and
  a **separator-only** form `^(\s*)(:{2,4}|;;)\s*$` — `isEmpty = true`, the empty item the
  continuation produces (`:: `), whose Exit removes the separator (D4, symmetric with `* `).
  Continuation re-emits the separator + space at the same indent. (`depth` for description
  items is informational only — continuation reuses the **literal** separator, so the exact
  level number assigned to `;;` does not affect behavior; pick a stable value, e.g. 1.)
- **Not a list / verbatim text**: returns `null`; the command also returns `null`-equivalent
  (falls through) when the syntax tree says the cursor is inside a verbatim block (FR-008,
  handled in the command, not the parser).
- No marker family overlaps: checklist is tried before plain unordered/dash (they share the
  `*`/`-` prefix), block-title `.text` / block-macro `name::[…]` are excluded by requiring
  the marker's trailing space / separator shape exactly as the tokenizer does, and `....`
  (line-only) is a literal-block delimiter, not an ordered marker.

---

## Derived value: continuation outcome

The command computes, from a `ListMarker` and the current selection, one of three outcomes
(not a stored type — a control decision):

| Outcome | When | Effect (single transaction) |
|---------|------|------------------------------|
| **Continue** | recognized item, not empty | replace selection (if any), insert `\n` + `indent` + next-marker + space; cursor after marker (FR-001, FR-002–005, FR-007, FR-012). |
| **Exit** | recognized item, `isEmpty` | replace the marker region with empty, leaving `indent` only on a blank line (FR-006). |
| **Fall through** | `null`, or cursor in verbatim block | return `false`; `defaultKeymap` inserts a plain newline (FR-008, FR-011). |

**Next-marker derivation**: unordered/ordered-implicit/description → same `marker`;
checklist → same marker (`*`s or `-`) forced to `[ ] `; ordered-explicit → `${ordinal + 1}.`.

---

## Editor state read (not owned by this feature)

The command reads, but does not define:

- `EditorState.selection.main` — cursor/selection (D8).
- `EditorState.doc.lineAt(pos)` — the current line text and bounds.
- `syntaxTree(state)` from `@codemirror/language` — verbatim-block suppression (D5). The
  suppressing block kinds are `ListingBlock` (`----`), `LiteralBlock` (`....`, added by this
  feature), `PassthroughBlock` (`++++`), `CommentBlock` (`////`), and `TableBlock`.

No new persisted state, no schema, no migration.
