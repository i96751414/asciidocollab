# Data Model: Highlighting Tokens & Tag Mapping

**Feature**: 030-syntax-highlighting-rework | **Date**: 2026-06-20

This feature's "data model" is the **design-token set** and the **node → highlight-tag → token**
mapping. Values are HSL channel tuples (`H S% L%`) with **no** `hsl()` wrapper — the `c()` helper in
`asciidoc-theme.ts` wraps them as `hsl(var(--name))`. **No hex in the theme** (Constitution V).

> The values below are **starting points** chosen to (a) extend the existing brand palette, (b) follow
> the spec's severity names and the deep→light heading ramp, and (c) target WCAG AA. Per the
> 2026-06-20 clarification, conformance is **directional**: hue-tuning to meet WCAG AA and the ΔE ≥ 15
> adjacent-distinctness floor is expected during implementation, validated by the contrast/ΔE unit
> tests and an eyeball pass against `AsciiDoc Highlighting Review.html` (see quickstart.md).

## 1. Existing tokens (unchanged — for reference)

| Token | Light (`:root`) | Dark (`.dark`) | Role |
|-------|-----------------|----------------|------|
| `--syntax-heading` | `191 66% 36%` | `189 54% 62%` | heading level 0 (deepest) |
| `--syntax-attr` | `34 58% 42%` | `38 62% 62%` | attribute **entries**, block metadata |
| `--syntax-link` | `214 58% 46%` | `214 64% 72%` | links / xref / macros |
| `--syntax-string` | `152 46% 35%` | `152 44% 62%` | strings/values in source blocks |
| `--syntax-keyword` | `280 34% 52%` | `280 46% 74%` | conditionals, structural keywords |
| `--syntax-comment` | `196 14% 48%` | `192 14% 56%` | comments |
| `--syntax-punct` | `196 12% 44%` | `192 12% 58%` | punctuation (folds into `--markup`) |

## 2. New tokens (add to `globals.css`, both `:root` and `.dark`)

Keep the same block placement and ordering style as the existing `--syntax-*` group.

### 2.1 Scaffold + heading ramp

| Token | Light | Dark | Role |
|-------|-------|------|------|
| `--markup` | `205 9% 46%` | `205 10% 62%` | muted scaffold: all markup punctuation, fences, list/table markers |
| `--syntax-h1` | `196 58% 40%` | `194 50% 66%` | heading level 1 |
| `--syntax-h2` | `205 50% 43%` | `202 48% 70%` | heading level 2 |
| `--syntax-h3` | `210 40% 45%` | `208 42% 74%` | heading level 3 (and level ≥4 reuse, FR-004) |

> Heading level 0 = existing `--syntax-heading` (deepest). h0→h1→h2→h3 ramp lighter/desaturated; each
> adjacent pair must clear ΔE ≥ 15 and each must clear WCAG AA on the editor background.

### 2.2 Inline code chip + attribute reference

| Token | Light | Dark | Role |
|-------|-------|------|------|
| `--syntax-code-fg` | `200 18% 30%` | `200 16% 80%` | inline code foreground |
| `--syntax-code-bg` | `200 20% 94%` | `200 14% 22%` | inline code chip background |
| `--attrref` | `34 50% 46%` | `38 55% 68%` | inline attribute **reference** `{name}` (sibling of `--syntax-attr`, distinct) |
| `--syntax-callout` | `330 50% 45%` | `330 55% 72%` | callout marker `<1>` accent (distinct from prose, lists, links) |

> Inline-code AA is checked **fg-on-chip-bg** (not on editor bg). `--attrref` must read distinctly from
> `--syntax-attr` (attribute entries) and from prose. `--syntax-callout` is a dedicated accent (NOT
> `--primary`, which is a UI brand color not guaranteed AA as token text) and must clear AA on the
> editor background in both modes.

### 2.3 Admonition severity chips (`-fg` / `-bg` pairs)

Severity names follow the spec: note = info blue/teal, tip = green, warning = amber,
important = red, caution = orange. Only the **label** uses these; the body stays normal text.

| Token | Light | Dark | Severity |
|-------|-------|------|----------|
| `--admon-note-fg` / `-bg` | `200 70% 32%` / `200 55% 94%` | `200 65% 74%` / `200 38% 22%` | note (blue/teal) |
| `--admon-tip-fg` / `-bg` | `150 55% 30%` / `150 45% 93%` | `150 50% 68%` / `150 32% 20%` | tip (green) |
| `--admon-warning-fg` / `-bg` | `38 80% 33%` / `44 85% 91%` | `42 85% 66%` / `40 50% 22%` | warning (amber) |
| `--admon-important-fg` / `-bg` | `0 65% 42%` / `0 70% 95%` | `0 72% 74%` / `0 45% 25%` | important (red) |
| `--admon-caution-fg` / `-bg` | `24 78% 40%` / `28 82% 93%` | `28 82% 70%` / `26 50% 25%` | caution (orange) |

> All five `-fg` must be mutually distinct (ΔE ≥ 15 pairwise on the same background) and each `-fg`
> must clear AA on its own `-bg`. Inline `NOTE:` and block `[NOTE]` resolve to the **same** label token.

## 3. Node → highlight-tag → token mapping

Custom tags (declared via `Tag.define()` in/near `asciidoc-highlight-tags.ts`) are written `ad.*`.
"Change" = differs from today's mapping (see research.md for the current value).

### 3.1 Headings (Layer M)

| Node | Tag (new) | Token | Treatment |
|------|-----------|-------|-----------|
| `DocumentTitle` | `t.heading1` | `--syntax-heading` | bold, deepest |
| `Heading1` | `t.heading2` | `--syntax-h1` | bold |
| `Heading2` | `t.heading3` | `--syntax-h2` | semibold |
| `Heading3` | `t.heading4` | `--syntax-h3` | semibold |
| `Heading4`,`Heading5` | `t.heading5`,`t.heading6` | `--syntax-h3` | reuse level-3 (FR-004) |
| heading `=` marker | (decoration `.cm-ad-*` or `ad.markup`) | `--markup` | receded (FR-001) |
| — (all headings) | — | — | **no underline** (FR-003) |

### 3.2 Emphasis (Layer G — delimiter split)

| Node part | Tag | Token | Treatment |
|-----------|-----|-------|-----------|
| Bold delimiters `*`/`**` | `ad.markup` | `--markup` | receded |
| Bold content | `t.strong` | `--foreground` | bold |
| Italic delimiters `_`/`__` | `ad.markup` | `--markup` | receded |
| Italic content | `t.emphasis` | `--foreground` | italic |
| Mono delimiters `` ` `` | `ad.markup` | `--markup` | receded |
| Mono content | `t.monospace` | `--syntax-code-fg` + `--syntax-code-bg` | code chip (FR-014) |

### 3.3 Blocks & fences (Layer M; bodies already `--foreground`)

| Node | Tag (new) | Token | Treatment |
|------|-----------|-------|-----------|
| `ExampleBlock`,`SidebarBlock`,`OpenBlock` wrappers | `ad.markup` | `--markup` | fences recede; body normal |
| `ListingBlock`,`LiteralBlock` | `t.content` (unchanged) | `--foreground` | verbatim body readable (FR-019) |
| `TableBlock`/`Csv`/`Dsv`, `tableDelim`, `tableCellMark` | `ad.markup` | `--markup` | pipes/fences recede (FR-010) |
| `tableRow` body | `t.content` | `--foreground` | readable cells |
| `NestedTableBlock`, `nestedTableDelim` (`!===`), `nestedTableCellMark` (`!`) | `ad.markup` | `--markup` | nested-table fences/separators recede, same as `\|` (FR-023) — Layer G |
| `a\|`/`a!` AsciiDoc-cell-style prefix (`cellStyleMark`) | `ad.markup` | `--markup` | cell-style prefix recedes (FR-023) — Layer G |
| nested `tableRow` body | `t.content` | `--foreground` | readable nested cells (no flood, no prose) |
| table header cells | `ad.tableHeader` *(stretch)* | `--foreground` bold | FR-010 header emphasis (see research decision) |
| `BlockTitle` | `t.annotation` | `--markup` | caption: italic, muted (FR-009) |
| `BlockAttributeLine` | `t.meta` | `--syntax-attr` | unchanged |
| `TableCols` | `t.attributeValue` | `--syntax-attr`/`--attrref` | distinct from generic block-attr (feature-026 FR-046 retained) |

### 3.4 Admonitions (Layer G — per-severity label split)

| Node part | Tag (new) | Token | Treatment |
|-----------|-----------|-------|-----------|
| note label (inline `NOTE:` + block `[NOTE]`) | `ad.admonNote` | `--admon-note-fg/-bg` | chip |
| tip label | `ad.admonTip` | `--admon-tip-fg/-bg` | chip |
| warning label | `ad.admonWarning` | `--admon-warning-fg/-bg` | chip |
| important label | `ad.admonImportant` | `--admon-important-fg/-bg` | chip |
| caution label | `ad.admonCaution` | `--admon-caution-fg/-bg` | chip |
| admonition body / continuation | `t.content` | `--foreground` | normal text (FR-007, no flood) |

### 3.5 Lists (Layer M)

| Node | Tag (new) | Token | Treatment |
|------|-----------|-------|-----------|
| `UnorderedListItem` marker | `ad.markup` | `--markup` | receded; text `--foreground` |
| `OrderedListItem` marker | `ad.markup` | `--markup` | receded; text `--foreground` (glyph distinguishes) |
| `DescriptionList` term | `t.labelName` → `ad.descTerm` | `--foreground` bold | distinct term (FR-012) |
| `ChecklistItem` done `[x]` | `ad.checkDone` | `--syntax-string` | done state |
| `ChecklistItem` todo `[ ]` | `ad.checkTodo` | `--markup` | todo state (FR-013) |
| list item text / `Continuation` | `t.content` | `--foreground` | **no longer `--syntax-link`** (fixes FR-022 collision) |

> Checklist done/todo split requires Layer G (one `checklistMarker` token today → two).

### 3.6 Inline references, links, callouts, attributes (Layer M unless noted)

| Node | Tag | Token | Treatment |
|------|-----|-------|-----------|
| `Link`,`InlineMacro`,`CrossReference`,`xrefOpen/Close`,`XrefTarget` | `t.link` | `--syntax-link` | underline, followable (FR-015) |
| `XrefLabel` | `t.string` → `ad.xrefLabel` | `--foreground` | label reads as body (keep feature-026 FR-045) |
| `AttributeReference` `{name}` | `t.variableName` → `ad.attrRef` | `--attrref` | **now colored** (FR-017) |
| `AttributeEntry`,`InlineSet` | `t.meta` | `--syntax-attr` | unchanged |
| `Callout` `<1>` | `t.special(t.number)` → `ad.callout` | `--syntax-callout` (accent) | distinct from prose/lists (FR-018) |
| `InlineStem`,`StemBlock` math | `t.special(t.macroName)` → `ad.stem` | `--syntax-keyword` (scoped) | math scoped, not flooding (FR-011) |
| `AuthorLine`,`RevisionLine` *(new nodes)* | `ad.docInfo` | `--syntax-attr` (or muted) | header metadata distinct (FR-016) — Layer G |

### 3.7 Punctuation / comments (Layer M)

| Node/tag | Token | Treatment |
|----------|-------|-----------|
| `t.punctuation`,`t.separator`,`t.operator`,`t.bracket`,`t.character` | `--markup` | unify scaffold (was `--syntax-punct`) |
| `t.comment`,`t.lineComment`,`t.blockComment` | `--syntax-comment` | unchanged, italic |
| `t.contentSeparator` (thematic/page break) | `--markup` | receded |
| `t.invalid` | `--destructive` | unchanged |

## 4. Validation rules (asserted by tests)

- **R1 — Contrast**: **every token used as a syntax foreground** clears WCAG 2.1 AA (4.5:1 normal / 3:1 large/bold) against `--background` (chips: against their `-bg`), in `:root` **and** `.dark` (FR-020/SC-006). This set includes the new `*-fg`/content tokens, `--markup` (scaffold), `--attrref`, `--syntax-callout`, AND every existing `--syntax-*` token reused as a token foreground here (e.g. `--syntax-keyword` for stem, `--syntax-string` for check-done) — not just newly-added `-fg` tokens.
- **R2 — Adjacent distinctness**: ΔE ≥ 15 between `--syntax-heading`↔`h1`↔`h2`↔`h3`, pairwise among the five `--admon-*-fg`, and `checkDone`↔`checkTodo`, in both modes (SC-001/SC-003/SC-004; clarified 2026-06-20).
- **R3 — No flood**: each block body node resolves to `--foreground`; each block-wrapper/fence resolves to `--markup` (SC-002).
- **R4 — Distinct tags, no collisions**: list types, links, attribute references each resolve to a distinct tag/token; no two colliding constructs share a color (FR-022).
- **R5 — Verbatim inert**: inside `----`/`....`, characters `*`,`_`,`|`,`!`,`{…}` resolve to body text, not emphasis/table/nested-table/attr tags (FR-019).
- **R8 — Nested table receded**: `!===`, `!` separators, and the `a|`/`a!` cell-style prefix resolve to `--markup`; nested cell content resolves to `--foreground` (FR-023; no prose, no flood).
- **R6 — No underline**: heading tags carry no `text-decoration` (FR-003).
- **R7 — Preview unchanged**: rendered preview output byte-identical pre/post; sanitization & scroll-sync untouched (FR-021/SC-007; Constitution VIII).
