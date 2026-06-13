# Contract: Lezer Grammar Token Additions (US3, US7)

Extensions to `apps/web/src/lib/codemirror/asciidoc.grammar` + `asciidoc-block-tokens.ts` (external tokenizer) + `asciidoc-highlight.ts` (tag → style). The grammar is **extended, not replaced** (Constitution IV). Each new token gets a `@lezer/highlight` tag and a unit test asserting it tokenizes (and that surrounding text is unaffected).

## Header level: effective level, cutoff, discrete (US3, FR-009–011, 071, 072)

- The grammar tokenizes a heading and its **raw marker count**; the **effective level** (raw + active `:leveloffset:`) is applied as a styling concern **above** the grammar, because leveloffset depends on cross-file context the grammar cannot see (see `editor-extensions.md` §9). So the grammar emits a heading node with its raw level; a view-layer pass assigns the effective-level style and applies the max-level cutoff.
- **Cutoff (FR-010)**: a line whose **effective** level exceeds the valid maximum MUST NOT be styled as a heading (falls back to paragraph styling). The grammar's own tokenization still requires the AsciiDoc heading shape (markers + space + title text) and never matches inside verbatim blocks.
- **`:leveloffset:` attribute entry** (`+N`, `-N`, absolute, unset/`:leveloffset!:`) is tokenized as an attribute entry; the effective-level pass consumes it as state.
- **Discrete heading (FR-072)**: `[discrete]` / `[float]` block-attribute on the following heading is recognized (a `DiscreteHeading` marker) so the heading is styled as a heading but excluded from section folding/outline.

## New tokens / nodes (US7)

| Construct | Example | Node / tag | FR |
|-----------|---------|-----------|-----|
| Block attribute line (generic) | `[source,ruby]`, `[cols="1,1"]`, `[%header]`, `[.lead]`, `[quote, A]` | `BlockAttributeLine` → `meta`/`attributeName`+`attributeValue` | 025 |
| Link / bare URL / mailto | `https://x`, `link:x[]`, `mailto:a@b` | `Link` → `t.link` (incl. bare-URL token) | 026 |
| Inline passthrough | `+x+`, `pass:[x]` | `Passthrough` → `special(string)` | 027 |
| Inline anchor / bibliography | `[[id]]`, `anchor:id[]`, `[[[ref]]]` | `Anchor` / `BiblioAnchor` → `labelName` | 027 |
| Code callout | `<1>` | `Callout` → `t.number`/`special` | 027 |
| Thematic break / page break | `'''`, `<<<` | `ThematicBreak` / `PageBreak` → `t.contentSeparator` (distinct) | 028 |
| Conditional directive | `ifdef::a[]`, `ifndef::`, `ifeval::[]`, `endif::[]` | `Conditional` → `t.keyword` (NOT generic macro) | 051 |
| Inline UI/math macro | `kbd:[Ctrl]`, `btn:[OK]`, `menu:F[S]`, `stem:[x]`, `latexmath:[x]` | `UiMacro`/`InlineStem` → distinct `macroName` variants | 052 |
| CSV / DSV table | `,===`, `:===` | `TableBlock` variants (foldable) | 053 |
| Typographic quotes | `` "`x`" `` | `SmartQuote` → `t.quote` | 054 |
| Replacements / entities | `(C)`, `(R)`, `(TM)`, `&amp;` | `Replacement`/`Entity` → `t.character`/`special` | 054 |
| Hard line break | trailing ` +` | `HardBreak` → `t.escape` | 054 |

## Tokenizer notes

- `inlineWord` currently swallows `+ [ ( & '` — it MUST be narrowed (or higher-priority tokens added) so passthrough/anchors/callouts/replacements/smart-quotes/hard-breaks are recognized, **without** regressing existing inline emphasis/xref/attr-ref tokenization (regression tests required).
- The generic `blockMacroToken` MUST yield to a dedicated `Conditional` token for `ifdef/ifndef/ifeval/endif` so they highlight distinctly (FR-051).
- Block-attribute detection MUST generalize beyond the current `[stem]`/admonition special-casing while still routing `[stem]` and admonition labels to their existing nodes.

## Highlight tags (`asciidoc-highlight.ts`)

Each new node maps to a `@lezer/highlight` tag with a theme CSS variable (`--ad-*`) so all five editor themes pick it up automatically (no per-theme hand-editing — consistent with the existing token theming and Constitution V).

## Tests

- Pure tokenizer tests (jest) per construct: asserts the produced node/tag and that adjacent/normal text is unaffected (red→green per Constitution II).
- E2E (US7 spec): assert the corresponding `.cm-*` token classes render in the editor for a sample document.
