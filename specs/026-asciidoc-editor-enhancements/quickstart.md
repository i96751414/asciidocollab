# Quickstart: AsciiDoc Editor Enhancements

How to build, validate, and (per the user's requirement) **e2e-test every feature**.

## Prerequisites

- pnpm workspace installed; Docker (infra/integration + e2e stack).
- Branch `026-asciidoc-editor-enhancements`.

## Build & run (dev)

```bash
pnpm install
pnpm --filter @asciidocollab/web dev      # editor at the project page
```

## Quality gates (run before each commit — Constitution + quality-gates memory)

```bash
npx eslint .
pnpm run typecheck
pnpm -r build
npx fresh-onion                                  # layering check
pnpm audit --audit-level=high                    # gates new deps (lint, language-data, nspell, turndown)
pnpm --filter @asciidocollab/web exec jest --coverage   # NOT `test -- --coverage` (broken; see memory)
# per-package jest --coverage for domain/api/infrastructure/shared as touched
```

> Coverage thresholds are 90/90/90/90 and margins are thin on web branches — keep new code covered. Pure editor logic (fold ranges, tokenizers, completion/diagnostic/metrics/reference functions) is unit-tested; live-CM wiring is covered by e2e (below).

## E2E (mandatory for all features)

Run the isolated local stack (never against a dev DB):

```bash
rm -rf apps/web/.next            # avoid stale-build 500s (see quality-gates memory)
scripts/e2e-local.sh             # build + run full Playwright suite + teardown
# or: scripts/e2e-stack-up.sh    # persistent stack to iterate; override ASCIIDOCOLLAB_COLLAB_INTERNAL_PORT if 4001 busy
pnpm --filter @asciidocollab/web e2e -- <spec>   # a single spec while iterating
```

### E2E coverage matrix — one spec per story (apps/web/e2e/)

| Story | Spec (new) | E2E asserts |
|-------|-----------|-------------|
| US1 preview content loss (P1) | `editor-preview-toggle.spec.ts` | type text → toggle preview ×N → content byte-identical + cursor/scroll kept; **collab AND REST paths** |
| US2 line wrap (P1) | `editor-line-wrap.spec.ts` | toggle visible in settings; wrapping changes; persists across reload |
| US3 header levels | `editor-header-levels.spec.ts` | each level styled distinctly; in-file `:leveloffset:` shifts level; included file reflects inherited offset; `[discrete]` styled as heading + excluded from outline; effective-level >max not styled; **changing main file re-evaluates levels** |
| US4 folding + copy | `editor-folding.spec.ts` | fold section/table/block/conditional/comment-run; unfold restores; fold collapsed section → copy → paste = full section |
| US5 source highlighting | `editor-source-highlight.spec.ts` | `[source,js]` body shows language tokens; unknown lang = plain |
| US6 insert declaration | `editor-insert-source.spec.ts` | Code Block inserts `[source,…]` + delimiters; cursor at placeholder |
| US7 highlighting coverage | `editor-highlighting.spec.ts` | attr lines, links/URLs, passthrough/anchors/callouts, breaks, conditionals, UI/math macros, CSV/DSV, smart quotes render token classes |
| US8 assistance + cross-file | `editor-intelligence.spec.ts` | xref/attr/path/lang/builtin completion; unknown-xref/undefined-attr/unterminated diagnostics appear+clear; xref go-to-def switches file; Go to Symbol; main-file config (reject non-existent, allow unset); **changing/clearing main file refreshes graph+symbols+diagnostics+completion+heading levels without reload** |
| US9 conveniences | `editor-conveniences.spec.ts` | Ctrl+B/I/` apply; type mark wraps selection; snippet tab-stops; paste URL→link; paste/drop image→`image::`; paste HTML→AsciiDoc; spell-check flags prose not code |
| US10 fold-all/persist | `editor-fold-all.spec.ts` | fold-all/unfold-all/to-level; fold state restored on reopen |
| US11 metrics | `editor-metrics.spec.ts` | word count + reading time shown; update on edit |
| US12 refactoring | `editor-refactoring.spec.ts` | rename id updates all refs across files; find-usages lists them; move/rename file rewrites include/image/xref; warn on break; **move/rename the configured main file keeps the main-file config valid; rename-to-non-adoc or delete clears it** (FR-070) |
| FR-068 preview assembly | `editor-preview-includes.spec.ts` | with a main file, preview renders resolved includes |
| **Security (Principle IX)** | `editor-security-boundary.spec.ts` | include with `../`/absolute/remote target is **rejected** (not rendered); pasted HTML is sanitized (no script survives); dropped non-image / oversized file rejected; embedded source language not executed |

## Per-increment manual validation

- **A (P1)**: open a doc on both collab and offline/REST paths; toggle preview repeatedly — content must never blank or reset; toggle Soft Wrap in settings and reload.
- **B (P2)**: enter each US7 construct + over-max heading; fold sections/tables/conditionals; copy a collapsed section.
- **C (P3 editing)**: insert a code block (has `[source]`); highlight inside `[source,js]`; use shortcuts/auto-pair/tab-stops; paste a URL/HTML/image; check word count; fold-all + reopen to confirm persisted folds.
- **D (P3 intelligence)**: set a project main file that includes others; complete an xref to an anchor in another file; see a diagnostic for an undefined attribute; go-to-definition switches files; rename an anchor and confirm cross-file updates; move a referenced file and confirm paths rewrite.

## Definition of done (per Constitution II + user requirement)

A feature is done when: failing unit tests were written first and now pass (red→green→refactor), the Playwright spec for its story passes on the isolated stack, all quality gates are green, coverage holds at 90/90/90/90, and the Constitution Check callouts (VII main-file scoping, VIII preview seam untouched) remain satisfied.
