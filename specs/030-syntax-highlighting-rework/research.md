# Research: AsciiDoc Editor Syntax Highlighting Rework

**Feature**: 030-syntax-highlighting-rework | **Date**: 2026-06-20

This phase audits what the **current** editor already tags vs. what genuinely needs work, so the
plan targets the smallest correct change. The headline finding is that the input brief's two-layer
split (theme vs. grammar) **mis-assigns several constructs**: most "missing" constructs already have
distinct grammar **nodes** — they are merely collapsed onto shared or unmapped highlight **tags**.

## How the editor highlighting is built (ground truth)

- **Parser**: a first-party **Lezer grammar**, not a StreamLanguage and not an npm package.
  - `src/lib/codemirror/asciidoc.grammar` — node structure.
  - `src/lib/codemirror/asciidoc-block-token-logic.ts` — external block tokenizer (line-start aware), the
    real workhorse; emits whole-line tokens via `consumeToEOL` for headings, admonitions, etc.
  - `src/lib/codemirror/asciidoc-parser.js` — **generated** by `@lezer/generator` (do not hand-edit).
  - `src/lib/codemirror/asciidoc-highlight-tags.ts` — `styleTags({...})` mapping node types → `@lezer/highlight` tags. Single source of truth shared by the language and the tests.
  - `src/lib/codemirror/asciidoc-theme.ts` — `EditorView.theme` (chrome + `.cm-ad-*` line decorations) and `HighlightStyle.define([...])` (tag → `hsl(var(--syntax-*))`).
- **Tokens**: seven `--syntax-*` HSL-channel variables in `src/styles/globals.css`, `:root` (light, L82-88) and `.dark` (L125-131). No `--markup`, `--admon-*`, `--attrref`, or code-chip tokens exist yet.
- **Regeneration**: `lezer-generator src/lib/codemirror/asciidoc.grammar --output src/lib/codemirror/asciidoc-parser.js` — already wired into `predev`/`prebuild` in `apps/web/package.json`.

### Decision: extend the in-repo grammar (Constitution IV)

- **Decision**: Extend `asciidoc.grammar` + `asciidoc-block-token-logic.ts` in place; regenerate the parser. Do not vendor or add a second parser.
- **Rationale**: No maintained Lezer/CodeMirror-compatible AsciiDoc grammar exists to vendor verbatim; AsciiDoc's line-start/boundary rules already required a bespoke external tokenizer (feature 026, FR-044/SC-016). Constitution IV explicitly permits extending a first-party asset when no vendorable-compatible equivalent exists, provided that absence is documented — it is, here.
- **Alternatives considered**: (a) vendor an upstream grammar — none compatible exists; (b) a second/parallel parser for the new constructs — violates the "no second parser" constraint and would drift; (c) decoration-only (ViewPlugin) for everything — viable for *line-scoped* effects (already used via `.cm-ad-*`) but cannot express the per-token tag changes most FRs need.

## The flooding / collision mechanism (why constructs look wrong today)

Two root causes, both in the **tag-mapping** layer, not the grammar structure:

1. **Distinct nodes → shared generic tags.** `asciidoc-highlight-tags.ts` maps unrelated block/inline
   nodes onto the same `@lezer/highlight` tag, so the theme cannot tell them apart and one color
   "floods" or collides:
   - `ExampleBlock`→`t.string`, which also carries `Footnote`, `XrefLabel`, `AttributeValue`.
   - `SidebarBlock`→`t.typeName`, `TableBlock/CsvTableBlock/DsvTableBlock`→`t.className` (also generic source-block class names).
   - `OrderedListItem`, `UnorderedListItem`, `ChecklistItem` **all**→`t.list` → indistinguishable.
   - `t.list`→`--syntax-link` **same color as actual links** (`t.link`→`--syntax-link`): the exact lists-vs-links collision called out in FR-022.
   - `AdmonitionParagraph`/`AdmonitionContinuation`/`AdmonitionBlock` **all**→`t.keyword` (one purple), with **no per-severity distinction**.
2. **Tagged node, unmapped tag.** `AttributeReference`→`t.variableName`, but the `HighlightStyle` maps
   only `t.function(t.variableName)`/`t.definition(t.variableName)` — **plain `t.variableName` is never
   styled**, so `{name}` renders as uncolored prose (FR-017). (The code even comments this: "theme-unstyled reference tag".)

**Tag propagation note**: per the code's own comments, `highlightTree` does **not** propagate a parent
node's tag to its children — which is why the grammar uses *dedicated* `*Continuation` nodes to make
list/admonition continuation lines inherit a color. Consequence for us: a block **body** (`blockBody { bodyLine* }`, `rawBodyLine` untagged) already renders at `--foreground`; the colored block **wrapper** tag paints the **fence lines and gaps**, not the body. So de-flooding is mostly "retune the wrapper tag to muted markup," achievable in the mapping/theme layer.

## Per-construct layer assignment

Legend — **T**: tokens only (`globals.css`); **M**: tag-mapping/theme only (`asciidoc-highlight-tags.ts` + `asciidoc-theme.ts`, **no** regen); **G**: grammar/tokenizer (edit `.grammar`/`asciidoc-block-token-logic.ts`, **regen** parser).

| FR | Construct / goal | Current state | Layer | Notes |
|----|------------------|---------------|-------|-------|
| FR-002 | Heading ramp levels 0-3 | Level exposed: `DocumentTitle`→`t.heading1`, `Heading1..5`→`t.heading2..6`; theme paints all `--syntax-heading` | **T+M** | Add `--syntax-h1/-h2/-h3`; map `t.heading1`→h0 (deepest), `t.heading2/3/4`→ramp; levels >3 reuse h3 (FR-004). |
| FR-003 | Remove heading underline | Current `asciidoc-theme.ts` headings have **no** underline (line 111 underline is on **links**). | **M** | Likely already satisfied; add a regression test asserting no `text-decoration` on heading tags. Confirm the HTML "Current" underline isn't from a stale build. |
| FR-001/FR-005 | Recede emphasis `*`/`_`/`` ` `` delimiters, keep content legible | `Bold/Italic/Monospace` are a **single whole-span external token** (boundary-checked, FR-044/SC-016) — delimiters **not** separable | **G** | Highest-risk item. Tokenizer must emit delimiter + content sub-tokens **without** losing the lookbehind boundary decision. Keep the span decision in the tokenizer; emit 3 parts. Heavy test coverage required (must not regress `a*b*c`/`2*3*4`). |
| FR-001 | Recede heading `=` marker | `docTitleToken`/`headingNToken` consume the **whole line** (`consumeToEOL`) | **G** *(or decoration)* | Either split the leading `=` run into a marker sub-token, **or** recede it via a `.cm-ad-*` line decoration on the marker range (cheaper, lower-risk). Decide in tasks; lean decoration. |
| FR-001/FR-008 | Recede block fences | Fence tokens (`exampleDelim`, `tableDelim`, …) exist; wrapper tag currently colors them | **M** | Map block-wrapper nodes → muted markup tag so fences recede; bodies already `--foreground`. |
| FR-006/FR-007 | Admonition **label** severity (5), label split from body | `admonitionLineToken` (inline) & `admonAttrToken` (block) are single tokens; **no severity**; inline form consumes the whole line so label isn't split | **G** | Tokenizer emits **per-severity label tokens** (note/tip/warning/important/caution) and, for the inline `NOTE:` form, consumes **only the label** so the body parses as normal inline content. Block `[NOTE]` body is already a delimited `blockBody` (not flooded). Map labels → `--admon-*` chips. |
| FR-008/FR-011 | De-flood table/example/sidebar/stem bodies | Wrapper nodes→shared colored tags; bodies already untagged (`--foreground`) | **M** | Remap `ExampleBlock`/`SidebarBlock`/`TableBlock`/`StemBlock`/`QuoteBlock` wrappers to muted markup; scope `InlineStem`/`StemBlock` math to its own tag, not the block. |
| FR-009 | Block title `.Title` as caption | `BlockTitle`→`t.annotation`→`--syntax-attr` (amber line) | **M** | Retune to caption (italic, muted). Node already whole-line; fine. |
| FR-010 | Table pipes recede; header cells emphasized | `tableDelim`→`t.separator`, `tableCellMark`→`t.operator` (recede via theme ✓); **header cells not distinguished** (all `tableRow`→`t.content`) | **M** (pipes) **+ G** (header) | Pipes/cells recede in theme. Header-cell emphasis needs the tokenizer to mark the first row — **decision below** (defer or heuristic). |
| FR-023 | Nested tables `a\|`/`a!` + `!===`/`!` recede like top-level tables | **No** `!===`/`!` token today: `!` is not in `inlineWord`'s exclusion set, so nested-table lines parse as a plain `Paragraph` → render as **prose** (verified). No `a\|`/`a!` cell-style recognition. | **G** | Mirror the existing `,===`/`:===` line-start handling: add `nestedTableDelim` (`!===`), accept `!` as a cell mark in nested context, recognize the `a\|`/`a!` cell-style prefix; add `NestedTableBlock` to the grammar; map all → `ad.markup`, nested body → `t.content`. Single-level nesting suffices. Regenerate the parser. |
| FR-012/FR-022 | List types distinct; markers muted | `Ordered/Unordered/Checklist`→`t.list` (collide), `Description`→`t.labelName`; markers not separately receded from text but markers are their own tokens | **M** | Give each list node a distinct tag; markers → muted markup; description term → bold foreground. Type distinction is primarily **structural (marker glyph) + emphasis**, not per-type hue — see decision. |
| FR-013 | Checklist done vs todo | `checklistMarker` is **one** token for `[x]` and `[ ]` | **G** | Tokenizer emits distinct done/todo marker tokens; map done→accent, todo→muted. |
| FR-014 | Inline code chip | `Monospace`→`t.monospace`→`--syntax-string` (green, no chip) | **T+M** | Add `--syntax-code-fg/-bg`; map mono **content**→fg + background chip while the `` ` `` delimiters recede to `--markup` (consistent with the emphasis delimiter split — see data-model §3.2). |
| FR-015 | Links followable, distinct | `Link`/`InlineMacro`/`CrossReference`→`t.link`→`--syntax-link` underline (already tagged) | **M** | Retune only; ensure distinct from lists once FR-022 frees `t.list` from `--syntax-link`. |
| FR-016 | Document-header author/revision lines | **No** `AuthorLine`/`RevisionLine` node — header lines parse as plain `Paragraph` | **G** | Tokenizer recognizes the author line (line 2) and revision line (line 3) after a `DocumentTitle`; map to a metadata treatment. |
| FR-017 | Attribute reference `{name}` | `AttributeReference`→`t.variableName`, **theme never maps plain `t.variableName`** → uncolored | **T+M** | Add `--attrref`; map `t.variableName` (or a custom attrref tag) → `--attrref`. No grammar change. |
| FR-018 | Callouts distinct from prose/lists | `Callout`→`t.special(t.number)` → falls back to `t.number`→`--syntax-attr` (colored) | **T+M** | Add `--syntax-callout`; retune `ad.callout` to that accent; ensure distinct from ordered lists. Callout list items: acceptable as ordered items for now. |
| FR-019 | No emphasis/table/attr styling inside verbatim | Listing/literal bodies are `rawBodyLine` (no inline parsing) → already inert | **M (verify)** | Add a test asserting `*`,`_`,`|`,`{…}` inside `----`/`....` are not styled. Likely already correct. |
| FR-020 | WCAG AA both modes + mid-session switch | N/A (new) | **T** | Choose token values to pass 4.5:1 / 3:1; add a contrast unit test over the whole token set. |
| FR-021/SC-007 | No preview/sanitization/editing change | Editor-only modules; preview uses Asciidoctor separately | **guard** | Add a guard test: preview output byte-identical pre/post; scroll-sync seam untouched. |

### Summary of layer assignment

- **T (tokens)** new: `--markup`, `--syntax-h1/-h2/-h3`, `--syntax-code-fg/-bg`, `--attrref`, `--syntax-callout`, `--admon-{note,tip,warning,important,caution}-{fg,bg}`.
- **M (mapping/theme), no regen**: heading ramp, remove underline (verify), de-flood blocks + recede fences, block-title caption, list-type distinction, table pipes recede, attribute-reference color, inline-code chip, link/callout retune, verbatim-inert verification, markup punctuation base.
- **G (grammar/tokenizer, regen)**: admonition per-severity + label split (largest), emphasis delimiter/content split (riskiest, FR-044), heading `=` marker recede (or decoration), checklist done/todo, author/revision header lines, table header-cell distinction (decision pending), nested-table `!===`/`!` + `a|`/`a!` cell style (FR-023, mirrors `,===`/`:===`).

## Open decisions resolved here

### Emphasis delimiter/content split (FR-001, FR-005) vs. FR-044 boundary correctness
- **Decision**: Split `boldMarkToken`/`italicMarkToken`/`monoMarkToken` into `<openDelim><content><closeDelim>` **inside the existing external tokenizer**, preserving the current lookbehind decision about whether a span opens at all. Tag delimiters → markup, content → bold/italic/code.
- **Rationale**: The tokenizer already computes the full span with boundary awareness; emitting three sub-tokens instead of one keeps SC-016 (`a*b*c`, `2*3*4` not bolded) intact while satisfying "delimiters recede." It does **not** introduce inner nesting (the documented tradeoff stays).
- **Risk/mitigation**: Regression risk on boundary cases — mitigated by porting the existing FR-044/SC-016 tests and adding delimiter-class assertions before implementing (red-green).

### Heading `=` recede: tokenizer split vs. decoration
- **Decision (lean)**: Recede the leading `=` run via a `.cm-ad-*` line decoration over the marker range rather than re-tokenizing, since a line-decoration layer already exists (`.cm-ad-h0..h5`). Re-tokenizing the whole-line heading token is higher risk for no functional gain. Finalize in `/speckit-tasks`.

### List-type distinction with muted markers (FR-012)
- **Decision**: Markers recede to `--markup`; **type distinction is structural** — the marker glyph (`*` vs `1.` vs `term::`) plus emphasis (description term = bold foreground; checklist done/todo colored). No per-type hue on the marker.
- **Rationale**: Coloring markers per type would contradict the recede-the-scaffold goal (FR-001). The clarified ΔE rule applies to **color** families; list types are differentiated by glyph + weight, which the HTML mock confirms. SC-004 is met via glyph + term/checklist treatment; a test asserts each list node resolves to its own tag.

### Table header-cell emphasis (FR-010)
- **Decision**: Treat as a **stretch item**. The tokenizer does not mark a header row today; reliable header detection depends on table options (`[%header]`, `cols`, first-row-blank rule). Recommend implementing pipe/cell recede + readable cells first (satisfies the bulk of FR-010), and adding header-cell emphasis only if a low-risk first-row heuristic proves clean; otherwise document the limitation. Revisit in `/speckit-tasks`.

### Heading underline (FR-003)
- **Finding**: The current `asciidoc-theme.ts` applies **no** underline to headings (the only underline is on links). FR-003 is likely already satisfied; the "Current" column underline may reflect a pre-refactor build. **Action**: add a regression test asserting no heading underline; no code change expected.

## Testability of "distinguishable" (clarified 2026-06-20)
- Adjacent same-family **color** treatments (heading levels 0-3; admonition severities; checklist done/todo) must differ by a minimum perceptual delta — recommended floor **ΔE ≥ 15** (CIELAB), exact value fixed in tasks. A unit test computes ΔE between adjacent tokens in both modes.
- WCAG AA (4.5:1 normal, 3:1 large/bold) is asserted by a contrast unit test over every token against `--background`/chip background, in `:root` and `.dark`.
- Conformance to `AsciiDoc Highlighting Review.html` is **directional** (clarified): tests assert behavioral distinctness + contrast, not exact hex; hue-tuning to meet contrast is permitted.
