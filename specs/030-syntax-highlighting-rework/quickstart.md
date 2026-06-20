# Quickstart: Verifying the Highlighting Rework

**Feature**: 030-syntax-highlighting-rework | **Date**: 2026-06-20

How to confirm the reworked scheme against the visual source of truth,
`AsciiDoc Highlighting Review.html` (right "Proposed" column = target; left "Current" = before),
**construct by construct, in both light and dark mode**. Conformance is directional (clarified
2026-06-20): you're confirming behavioral distinctness + WCAG AA + the ΔE floor, not exact hex.

## 0. Build & run

```bash
cd apps/web
# Regenerate the parser if the grammar/tokenizer changed (Layer G):
pnpm exec lezer-generator src/lib/codemirror/asciidoc.grammar --output src/lib/codemirror/asciidoc-parser.js
# (predev/prebuild already run this; run manually for a quick loop)

pnpm dev            # start the app, open the editor
# Open AsciiDoc Highlighting Review.html (repo root) side-by-side for comparison.
```

Toggle light/dark with the app's theme switch (`darkMode: 'class'`) and re-check every construct in
**both** modes without reloading (FR-020 mid-session switch).

## 1. Automated gates first

```bash
cd apps/web
pnpm exec lezer-generator src/lib/codemirror/asciidoc.grammar --output src/lib/codemirror/asciidoc-parser.js
pnpm test tests/lib/codemirror      # highlight-consistency + style resolution
pnpm test tests/lib/codemirror/asciidoc-contrast.test.ts   # WCAG AA + ΔE (new)
pnpm typecheck
pnpm lint
```

All green before eyeballing. The contrast test enforces data-model.md R1 (AA) and R2 (ΔE ≥ 15) in
`:root` and `.dark`; the consistency tests enforce R3–R6 (no flood, distinct tags, verbatim inert, no
heading underline).

## 2. Paste this sample into the editor

```asciidoc
= Document Title
Jane Author <jane@example.com>
v2.1, 2026-06-20

== Section One
=== Subsection
==== Deep heading

A paragraph with *bold*, _italic_, `inline code`, a {version} attribute,
https://example.org[a labeled link], and a bare https://example.org URL.

NOTE: this is an inline note.
TIP: a tip.
WARNING: a warning.
IMPORTANT: an important.
CAUTION: a caution.

[WARNING]
====
A block admonition body — should read as normal text.
====

* unordered item
. ordered item
term:: description
* [x] done task
* [ ] todo task

.Block Title
|===
| Header A | Header B
| body 1 | body 2
|===

[cols="2*"]
|===
| Plain cell
a| AsciiDoc cell with a nested table:

!===
! Nested A ! Nested B
! 1 ! 2
!===
|===

[source,ruby]
----
def hi = "literal * _ | {x} stay plain"  # <1>
----
<1> a callout

[stem]
++++
E = mc^2
++++
```

## 3. Construct-by-construct checklist (both modes)

| # | Construct | Expected (Proposed column) | FR |
|---|-----------|----------------------------|----|
| 1 | Markup punctuation (`=`, `*`, `_`, `\|`, markers, fences) | one muted `--markup` treatment, quieter than prose; no construct floods its interior | FR-001, SC-002 |
| 2 | Headings 0–3 | four distinct colors, deep→light (title deepest); **no underline**; level 4 reuses level-3 | FR-002/003/004, SC-001 |
| 3 | Bold / italic | content bold/italic at `--foreground`; `*`/`_` delimiters receded | FR-005 |
| 4 | Inline code | code chip (`--syntax-code-fg` on `--syntax-code-bg`), distinct from prose & strings | FR-014 |
| 5 | Attribute ref `{version}` | colored (`--attrref`), distinct from prose & from `:attr:` entries | FR-017 |
| 6 | Links (labeled + bare) | followable (link color + underline), distinct from list items & prose | FR-015, FR-022 |
| 7 | Inline admonitions | only the label tinted per severity (note=teal, tip=green, warning=amber, important=red, caution=orange); body normal | FR-006/007, SC-003 |
| 8 | Block admonition `[WARNING]` | label chip; fences receded; body normal (not flooded) | FR-006/008 |
| 9 | List types | unordered / ordered / description distinguishable; markers muted, text normal | FR-012, SC-004 |
| 10 | Checklist | done vs todo visually distinct | FR-013 |
| 11 | Block title `.Block Title` | caption (italic, muted), not a stray amber line | FR-009 |
| 12 | Table | `\|` receded; header cells emphasized vs body (or documented limitation); cells readable | FR-010 |
| 13 | Listing block body | source highlighting intact; `* _ \| {x}` inside render as **plain** (verbatim) | FR-019 |
| 14 | Callout `<1>` + callout item | distinct from prose and from other list types | FR-018 |
| 15 | Stem `E = mc^2` | math scoped to its own treatment; `[stem]`/fences receded, not flooded | FR-011 |
| 16 | Document header | author line + revision line distinct from body prose | FR-016 |
| 17 | Nested table (`a\|` + `!===`/`!`) | `!===` delimiter, `!` separators, and `a\|`/`a!` cell prefix receded to `--markup` (same as `\|===`/`\|`); nested cell content readable, not prose, not flooded | FR-023 |

For each row: confirm in **light**, then toggle to **dark** and confirm again (legible, AA, no reload).

## 4. Regression guards (must NOT change)

- **Preview output**: render the sample in the preview pane — output is byte-for-byte identical to
  pre-rework (FR-021/SC-007). A test asserts this; spot-check visually too.
- **Sanitization & scroll-sync**: unchanged — no editor pipeline regression (Constitution VIII).
- **Boundary correctness (feature-026 FR-044/SC-016)**: `a*b*c` and `2*3*4` are **not** bolded after the delimiter
  split; genuine `*bold*` is. Confirm in the editor and via the ported boundary tests.

## 5. If a token fails AA or the ΔE floor

Per the directional-conformance clarification, **tune the hue/lightness** of the offending token in
`globals.css` (both modes as needed) and re-run the contrast test — do not chase the mock's exact hex.
Keep the deep→light heading order and the severity color identities (teal/green/amber/red/orange).

## 6. Known limitations (documented deviations from the spec)

The following constructs do not yet have full Layer G (grammar/tokenizer) support. They are documented
here so reviewers know what to expect and do not mistake them for regressions.

### 6.1 Inline bold/italic/mono delimiters not split from content (T009/T010 — deferred)

**Status**: Deferred as too risky mid-feature.

`*`, `_`, `` ` `` delimiters and their content are tokenised as a single span. Both use the same
token, so the delimiter cannot independently recede to `--markup` while the content stays at
`--foreground`. What you see: bold text renders in `--foreground` with bold weight (correct), but the
`*` delimiters are also bold/foreground rather than muted. This is a visual shortfall, not a
regression — the delimiter-split redesign (`boldMarkToken` → open/content/close sub-tokens) was deferred
due to lookbehind-interaction risk with the boundary-correctness tests (feature-026 FR-044/SC-016).

### 6.2 Table header cells not emphasized (T030 — skipped)

**Status**: Skipped (STRETCH goal, detection not clean).

Row 12 in the checklist says "header cells emphasized vs body (or documented limitation)". The
`[%header]` / first-row heuristic is not implemented. All table cells render identically at
`--foreground`. This is an accepted limitation; the `ad.tableHeader` tag is defined but never emitted.

### 6.3 Nested tables not receded (T030a — deferred)

**Status**: Deferred (FR-023, grammar complexity).

Row 17 (`!===` nested tables): the `!===` delimiter and `!` cell separators currently receive no
special treatment — they render as plain prose rather than receding to `--markup`. The `a|`/`a!`
cell-style prefix is also unhandled. The grammar extension for nested tables was scoped out due to
the risk of parser ambiguity inside AsciiDoc-style cell bodies.

### 6.4 Author/revision lines not highlighted (T040 — deferred)

**Status**: Deferred. Grammar stubs exist (`AuthorLine`/`RevisionLine`) but the external tokenizer
never emits them — detecting "line 2/3 of the document header" requires document-position context
not available via `canShift` alone. Row 16 (document header): author and revision lines render as
plain prose.

### 6.5 Final token values (light / dark)

All tokens are in `src/styles/globals.css` as HSL channel tuples (`H S% L%`).
Key design-token additions from this feature:

| Token | Light | Dark | Used for |
|-------|-------|------|----------|
| `--syntax-heading` | `188 70% 26%` | `188 70% 55%` | DocumentTitle |
| `--syntax-h1` | `222 58% 33%` | `222 60% 62%` | Heading 1 (`==`) |
| `--syntax-h2` | `258 44% 40%` | `258 48% 70%` | Heading 2 (`===`) |
| `--syntax-h3` | `294 30% 45%` | `294 34% 76%` | Heading 3–5 (`====`+) |
| `--markup` | `205 9% 45%` | `210 10% 55%` | Structural punctuation (fences, markers, `=` runs) |
| `--attrref` | `34 50% 39%` | `34 50% 65%` | `{attr}` references |
| `--syntax-callout` | `218 40% 48%` | `218 50% 68%` | Callout markers `<1>` |
| `--admon-note-fg/bg` | `196 58% 28% / 196 58% 92%` | `196 58% 62% / 196 58% 22%` | NOTE chip |
