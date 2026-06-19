# Quickstart: Cross-Document Attribute Resolution & Editor State Memory

How to work on and validate this feature locally.

## Prerequisites

- Monorepo installed: `pnpm install` at repo root.
- App under `apps/web`. Unit tests: Jest. E2E: Playwright (`apps/web/e2e`, stack via `docker-compose.e2e.yml`).

## Run

```bash
# unit/component tests (every feature)
cd apps/web && pnpm test                     # jest
pnpm check                                    # tsc + eslint + jest (gate)

# e2e (every cross-file feature)
pnpm e2e                                      # playwright

# math stylesheet scoping build step (when math lib added)
pnpm build:asciidoctor-style                  # pattern to mirror for scoped math CSS
```

## Key files to touch

- Resolution: `src/lib/asciidoc/extraction.ts` (+ mirror `packages/domain/src/services/asciidoc-extraction.ts`).
- Render: `src/workers/asciidoc-render.worker.ts`, `src/workers/assemble-includes.ts`.
- Editor: `src/lib/codemirror/asciidoc.grammar`, `asciidoc-block-token-logic.ts`, `asciidoc-highlight-tags.ts`, new `inline-style-registry.ts` / `conditional-dimming.ts` / `cross-doc-attributes.ts`.
- Outline (R11): `src/lib/codemirror/asciidoc-outline.ts`, `asciidoc-heading-levels.ts` (resolved titles, offset refresh, inactive-branch exclusion), `src/hooks/use-section-outline.ts`.
- Math: `src/components/asciidoc-preview.tsx` + new `src/components/math/render-math.ts`.
- Cursor memory: `src/hooks/use-last-selection.ts` (extend to per-file map).
- Wiring: `src/hooks/use-asciidoc-preview.ts`, `use-project-symbol-index.ts`.

## Manual verification (maps to acceptance scenarios)

1. **Cross-file attribute (US1)**: set the project **main file** in project settings; in it `:productName: Acme` then `include::child.adoc[]`; open `child.adoc` (references `{productName}`) → preview shows "Acme". Edit the value → preview updates live.
2. **leveloffset (US2)**: parent `include::child.adoc[leveloffset=+1]` → child level-1 title renders as level-2.
3. **idprefix/xrefstyle (US3/US4)**: `:idprefix: sect_`, `:idseparator: -`, `:xrefstyle: full` in the main file → child heading id `sect_my-section`; `<<id>>` renders full style.
4. **Captions family (US5)**: `:table-caption: Tabela`, `:toc-title: Conteúdo` in main file → child table label "Tabela N."; TOC title localized.
5. **Conditionals (US8)**: `ifdef::draft[]…endif::[]` gated by a main-file `:draft:` → toggling the attribute shows/hides live; conditional wrapping an `include::` includes/skips it.
6. **Partial includes (US9)**: `include::f.adoc[tags=intro]` / `[lines=2..4]` → only the slice renders.
7. **sectnums/toc (US10)**: `:sectnums:` + two `leveloffset=+1` chapters → continuous numbering; TOC at offset levels.
8. **Inline set / wrapping (US11)**: `{set:basedir:src/main/java}` then `{basedir}` renders the value; a `\`-continued `:longval:` joins lines; editor highlights both.
9. **Editor fidelity (US6/US12)**: a `{name}` defined only in an included file is highlighted; `a*b*c` is NOT bolded; `<<id,label>>` distinguishes target/label; `[cols="1,>2"]` highlighted; inactive `ifdef` branch dimmed live.
10. **STEM (US-STEM)**: `:stem:` + `stem:[x^2]` and `[stem]` block render as math (AsciiMath and LaTeX), client-side.
11. **Completeness (US13)**: bibliography, index terms, counters, page break render (no raw markup).
12. **Cursor memory (US7)**: scroll file A to line 120, file B to line 8, reopen each → cursor restored per file; second user on same browser keeps separate positions.
13. **Main-file change**: change the project main file in settings → all open files re-resolve and refresh live (FR-007b).
14. **Outline consistency (R11)**: open a non-root file included with `leveloffset=+1` → the section **outline panel** shows its headings at the offset-adjusted levels; a heading `== {productName} Guide` shows the resolved title in the outline; a heading inside an inactive `ifdef` branch is excluded/marked; changing the main file refreshes the outline live.

## Definition of done

- All new functional behavior has Jest unit/component tests (red-green).
- Every cross-file behavior (items 1–7, 9-cross-file, 12, 13) also has a Playwright e2e test.
- `pnpm check` green; DOMPurify and scroll-sync regression tests pass; math CSS scoped (no chrome change).
