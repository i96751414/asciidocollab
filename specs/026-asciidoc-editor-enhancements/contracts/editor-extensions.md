# Contract: Editor Extensions (internal CM6 interfaces)

This is an editor/parser project, so the load-bearing contracts are the CodeMirror extension boundaries. Each is a small, independently unit-testable module under `apps/web/src/lib/codemirror/`. Signatures are contracts (inputs/outputs/triggers), not implementations.

## 1. Fold service (`asciidoc-fold.ts`, extended) — US4/US10

```ts
// Pure range computation (unit-tested without a live editor):
foldRangeForSection(state, lineFrom): {from,to} | null     // heading → next same/higher heading or EOF
foldRangeForBlock(node): {from,to} | null                  // + LiteralBlock, AdmonitionBlock
foldRangeForTable(node): {from,to} | null                  // PSV/CSV/DSV
foldRangeForConditional(state, ifdefLine): {from,to} | null// ifdef/ifndef/ifeval … endif (cycle/nesting safe)
foldRangeForCommentRun(state, line): {from,to} | null       // consecutive // lines
foldRangeForAttrRun(state, line): {from,to} | null          // consecutive :name: header lines
```
- **Guarantee**: folding never edits the document (FR-015); a selection spanning a fold includes hidden text (copy-collapsed, FR-016a — CM default).
- Commands: `foldAll`, `unfoldAll`, `foldToLevel(n)` (FR-042). Fold persistence via `asciidoc-fold-persist.ts` ↔ per-user prefs (FR-043).
- `{attr}` collapse-to-value (FR-057) is a **replace decoration**, not a fold range — separate provider.

## 2. Lint source (`asciidoc-diagnostics.ts`, new) — US8

```ts
asciidocLinter(getSymbolIndex): LintSource   // async, debounced; returns Diagnostic[]
```
- Codes: `unterminated-block`, `unknown-xref`, `duplicate-id`, `undefined-attribute`, `unresolved-include` (FR-032/033/050/060).
- MUST be tolerant of in-progress edits (FR-035); suppressed inside verbatim where constructs aren't interpreted.

## 3. Completion sources (`asciidoc-completions.ts`, extended) — US8

```ts
// existing (current-file): attributeRef, xref, includePath, imagePath, table snippets
sourceLanguageCompletion(): CompletionSource          // NEW: [source,<lang>] (FR-031)
builtinAttributeCompletion(): CompletionSource         // EXPOSE/extend (FR-059)
// xref + attributeRef EXTENDED to draw targets from the project symbol index (FR-029/030)
```
- Cross-file variants consult the symbol index (R4); suppressed inside verbatim blocks (FR-035).

## 4. Source-language highlight (`asciidoc-source-highlight.ts`, new) — US5

```ts
asciidocSourceHighlight(): Extension   // parseMixed; resolves [source,lang] → lazy LanguageSupport
```
- Unknown/absent language ⇒ no injection, plain text; AsciiDoc highlighting resumes after the block (FR-018/019). Confined to the editor surface (Constitution VI).

## 5. Symbol index (`asciidoc-symbol-index.ts` + `use-project-symbol-index.ts`, new) — US8/US12

**Shapes + pure logic are imported from `packages/shared/src/asciidoc-model` and `…/project-path` — NOT defined here.** This module is a thin client projection that adds CM ranges/decorations:
```ts
// from packages/shared (single source):
buildIncludeGraph(rootFileId, readContent, resolveSandboxedPath): DocumentTree  // transitive, cycle-guarded (FR-046/050); edges carry leveloffset-at-include
extractSymbols(tree): ProjectSymbol[]                            // shared
extractReferences(tree): Reference[]                             // shared (also used by domain FindReferencesUseCase)
resolve(ref, symbols): ProjectSymbol | 'unresolved'              // shared
inheritedLevelOffset(fileId): number                             // shared (FR-071)
// web-only: map shared shapes → CM ranges/decorations for the editor projection
```
- Content source: persisted + open-file live overlay (FR-048); degrades to current-file scope when no main file (FR-047). Include/image path resolution goes through the shared `resolveSandboxedPath` (Constitution IX). Editor-side index is a read-only projection independent of the preview render path; the FR-068 preview assembly is a separate, IX-gated path (also using `resolveSandboxedPath`).
- **Reactivity (FR-045a)**: keyed on `(mainFileNodeId, contents)`; a main-file change or file-change SSE invalidates the index and **all dependents** (completion, diagnostics, **heading effective-level highlighting**) recompute without reload.

## 9. Heading effective-level highlight (`asciidoc-heading-levels.ts`, new) — US3

```ts
asciidocHeadingLevels(getInheritedOffset): Extension   // view-layer pass over heading nodes
```
- Computes effective level = raw marker count + in-file `:leveloffset:` state (document-order) + `getInheritedOffset(openFileId)` from the symbol index (FR-071); applies the per-level style, the max-level cutoff (FR-010), and discrete-heading styling (FR-072). Subscribes to index changes so a main-file change re-evaluates levels (FR-045a).

## 6. Metrics (`asciidoc-metrics.ts`, new) — US11

```ts
computeMetrics(docText): { words: number, readingTimeMin: number }   // pure; live-updates status bar (FR-044)
```

## 7. Keymap / input (`use-editor-mount.ts`, wired) — US9

- Keymap: `Mod-b/i/\`` → wrap actions; `Mod-/` → `toggleComment` (FR-036); MUST NOT override save/find/undo (FR-041).
- `inputHandler`: typing a mark over a selection wraps it (FR-037).
- Toolbar inserts use `snippet()` tab-stops (FR-038); Code Block inserts a `[source,<lang>]` declaration (FR-020).

## 8. Paste/drop (`asciidoc-paste.ts`, new) — US9

- Paste URL over selection → `link:` (FR-039); paste/drop image → upload via existing asset API → insert `image::` (FR-040); paste HTML → sanitize → `turndown` (HTML→MD) → `html-to-asciidoc.ts` mapper (FR-062), graceful fallback.

## Stable-position editor mount (`project-editor-layout.tsx`, fixed) — US1

- **Contract**: toggling `previewOpen` MUST NOT change the editor's parent element type or remount `AsciiDocEditor`. The editor lives in one stable mount point across both preview states (FR-001–004); collab + REST paths both retain content (FR-005).

Each module above ships with jest unit tests (pure functions) per Constitution II, plus the per-story Playwright e2e (quickstart.md matrix).
