# Implementation Plan: AsciiDoc Editor Syntax Highlighting Rework

**Branch**: `030-syntax-highlighting-rework` | **Date**: 2026-06-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/030-syntax-highlighting-rework/spec.md`

## Summary

Rework the CodeMirror 6 editor's AsciiDoc highlighting so structural markup recedes and authored content leads, and every common construct is distinguishable at a glance — without changing the rendered preview, sanitization, or editing behavior (FR-021/SC-007).

The work spans **three** layers (the input's two-layer model is refined here after auditing the code — see [research.md](./research.md)):

- **Layer T — Tokens** (`apps/web/src/styles/globals.css`): add design tokens for both light and dark — a muted `--markup` scaffold color, a heading ramp (`--syntax-h1/-h2/-h3` deriving from `--syntax-heading`), an inline-code chip (`--syntax-code-fg/-bg`), an attribute-reference color (`--attrref`), a callout accent (`--syntax-callout`), and five admonition severity chips (`--admon-note/-tip/-warning/-important/-caution` as `-fg`/`-bg` pairs).
- **Layer M — Tag mapping** (`apps/web/src/lib/codemirror/asciidoc-highlight-tags.ts` + `asciidoc-theme.ts`): the parser **already emits distinct nodes** for most constructs but the current `styleTags` collapses them onto a handful of shared generic Lezer tags (e.g. `ExampleBlock`→`t.string` collides with `Footnote`/`XrefLabel`; all list types→`t.list`; `{name}`→`t.variableName` which the theme never maps, so it renders uncolored). Give the colliding/uncolored nodes their own (custom) tags and retune the `HighlightStyle`. This de-floods blocks, distinguishes list types, colors attribute references, and applies the heading ramp — **no grammar regeneration required**.
- **Layer G — Grammar/tokenizer** (`apps/web/src/lib/codemirror/asciidoc.grammar` + `asciidoc-block-token-logic.ts`, then regenerate `asciidoc-parser.js`): only for constructs whose **node does not exist today**: per-severity admonition labels split from the body; receding the heading `=` and emphasis `*`/`_`/`` ` `` delimiters from their content; checklist done-vs-todo; document-header author/revision lines; nested tables (`a|`/`a!` cell style + `!===`/`!`, mirroring the existing `,===`/`:===` handling); (optionally) table header-cell distinction.

Constructs split per layer are enumerated in [research.md](./research.md); the full token list with light+dark values and the node→tag→token mapping table is in [data-model.md](./data-model.md); construct-by-construct verification against `AsciiDoc Highlighting Review.html` in both modes is in [quickstart.md](./quickstart.md).

## Technical Context

**Language/Version**: TypeScript 5.x; ESM. Lezer grammar (`.grammar`) compiled by `@lezer/generator`.

**Primary Dependencies**: Next.js (App Router), Tailwind v4 (`darkMode: 'class'`), shadcn/ui; CodeMirror 6 (`@codemirror/view`, `@codemirror/language`); `@lezer/highlight` `^1.2.3`, `@lezer/lr` `^1.4.10`, `@lezer/common` `^1.5.2`, `@lezer/generator` `^1.8.0` (dev).

**Storage**: N/A (presentation-only; no persistence, no per-user preference — single fixed scheme).

**Testing**: Jest + ts-jest (unit/highlight-consistency tests under `apps/web/tests/lib/codemirror/`); Playwright for any in-browser visual confirmation. Functional red-green per Constitution II; **no performance tests** (spec marks performance out of scope — Constitution II §opt-in).

**Target Platform**: Web (browser); editor source view only.

**Project Type**: Web application — monorepo, code under `apps/web` (paths below are relative to it).

**Performance Goals**: Out of scope (clarified 2026-06-20). No latency/throughput target; left to the existing tokenizer infrastructure.

**Constraints**: WCAG 2.1 AA contrast (4.5:1 normal text, 3:1 large/bold) for every token in both light and dark mode, legible across an in-session mode switch (FR-020/SC-006). Adjacent same-family treatments must differ by a defined minimum perceptual delta (CIE ΔE; recommended floor ΔE ≥ 15) so distinctness is automatically verifiable (clarified 2026-06-20). No hardcoded color literals in the theme (Constitution V). Preview output byte-for-byte identical before/after (FR-021/SC-007). No second parser; extend the existing grammar/tokenizer (Constitution IV).

**Scale/Scope**: One editor theme module, one tokens stylesheet block, one tag-mapping module, one grammar + one block-tokenizer module; ~23 functional requirements across ~20 AsciiDoc constructs (incl. nested tables, FR-023).

## Constitution Check

*GATE: evaluated against constitution v2.3.0. Re-checked after Phase 1 design — still passing.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Clean Code | PASS | Named tokens (no magic colors); tag-mapping kept as the single source of truth it already is. |
| II. TDD (functional, NON-NEGOTIABLE) | PASS | Red-green for each layer: highlight-consistency tests (a node resolves to the expected tag/class) and a WCAG contrast unit test precede implementation. **No performance/benchmark tests** — spec scopes performance out (II §opt-in); their absence is not a coverage gap. |
| III. Seam Testing w/ In-Memory Fakes | N/A | No repository interfaces touched. |
| IV. Reuse Before Rebuild | PASS (documented) | We **extend the existing in-repo Lezer grammar** rather than vendoring. research.md records the absence of a maintained Lezer/CodeMirror-compatible AsciiDoc grammar to vendor verbatim — the explicit condition IV permits for extending a first-party asset. |
| V. Theming via Design Tokens | PASS | All new colors are `--tokens` in `globals.css` (light + dark); the theme reads them via the `hsl(var(--…))` helper. Zero hex in `asciidoc-theme.ts`. This is the spine of the feature. |
| VI. Style Isolation | PASS | Changes are confined to the editor theme/grammar; preview/rendered-document styles untouched. |
| VII. Per-User Prefs / Shared Immutability | PASS | Single fixed scheme; no per-user preference, no color picker, no shared-content mutation (Out of Scope). |
| VIII. Editor Pipeline Integrity | PASS (guarded) | Sanitization and scroll-sync are **not** touched. Grammar/tokenizer edits change only editor token boundaries, never document text or render path. Guard: a test asserting preview output is byte-for-byte identical (SC-007) and no change to the scroll-sync seam. |
| IX. Untrusted Input Boundary | N/A | No new externally-sourced content enters the editor or render pipeline. |

**Result**: No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/030-syntax-highlighting-rework/
├── plan.md              # This file
├── research.md          # Phase 0 — per-construct A/M/G layer inventory + decisions
├── data-model.md        # Phase 1 — token list (light+dark) + node→tag→token mapping
├── quickstart.md        # Phase 1 — construct-by-construct visual verification vs the HTML mock
├── checklists/          # (from /speckit-checklist)
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (paths relative to `apps/web/`)

```text
src/styles/globals.css                              # Layer T — new design tokens (:root + .dark)
src/lib/codemirror/
├── asciidoc-theme.ts                               # Layer M — EditorView theme + HighlightStyle retune
├── asciidoc-highlight-tags.ts                      # Layer M — styleTags node→tag remap (+ custom tags)
├── asciidoc.grammar                                # Layer G — node structure (regenerate after edit)
├── asciidoc-block-token-logic.ts                   # Layer G — external block tokenizer (line-start)
├── asciidoc-block-tokens.ts                        # Layer G — external-token declarations
├── asciidoc-language.ts                            # wires parser + asciidocHighlightTags
└── asciidoc-parser.js                              # GENERATED — `lezer-generator` output (do not hand-edit)

tests/lib/codemirror/
├── asciidoc-highlight-style.test.ts                # tag→class resolution
├── asciidoc-highlight.test.ts                      # highlight-consistency (node emits expected tag)
├── asciidoc-language.test.ts
├── asciidoc-source-highlight.test.ts
└── (new) asciidoc-contrast.test.ts                 # WCAG AA check over the token set (light+dark)
```

**Grammar build step**: after any `.grammar` or external-tokenizer edit, regenerate with
`lezer-generator src/lib/codemirror/asciidoc.grammar --output src/lib/codemirror/asciidoc-parser.js`
(this is already wired into the `predev`/`prebuild` scripts in `apps/web/package.json`).

**Structure Decision**: Single web app; all edits live in the existing `apps/web/src/lib/codemirror` editor modules plus the `globals.css` token block. No new package, no new parser, no preview-side changes.

## Complexity Tracking

> No Constitution violations — section intentionally empty.
