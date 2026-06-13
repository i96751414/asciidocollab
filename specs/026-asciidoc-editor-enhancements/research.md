# Phase 0 Research: AsciiDoc Editor Enhancements

Decisions resolving the Technical Context unknowns. Each: **Decision / Rationale / Alternatives**. Constitution IV (Reuse Before Rebuild) governs every library choice; new dependencies are subject to the security constitution's dependency scanning.

---

## R1. In-editor source-language highlighting (US5, FR-017–019)

**Decision**: Inject a nested language into listing/source block bodies using CodeMirror's `@codemirror/language` `parseMixed`, resolving the declared `[source,<lang>]` language to a CM `LanguageSupport` from `@codemirror/language-data` (lazy `load()`), limited to a curated set (≈15 common languages). Unknown/missing language → no injection (plain text). Add `@codemirror/language-data`.

**Rationale**: `parseMixed` is the CM-native, incremental way to embed a sub-language; `language-data` lazy-loads maintained grammars (Constitution IV — reuse) and avoids bundling everything. Falls back cleanly per FR-018.

**Alternatives**: (a) `highlight.js` (already a dep) in a `ViewPlugin` decoration layer — rejected as primary because it re-tokenizes whole blocks on edit (not incremental) and duplicates CM's tree model, though it remains a fallback for languages absent from `language-data`. (b) Hand-written Lezer sub-grammars — rejected (Constitution IV, high cost).

---

## R2. HTML→AsciiDoc conversion (US9, FR-062)

**Decision (resolved)**: Use **`turndown`** (maintained, MIT, HTML→Markdown) for the HTML-parsing/structure half, plus a small in-house **Markdown-subset→AsciiDoc mapper** (`apps/web/src/lib/codemirror/html-to-asciidoc.ts`) covering the FR-062 scope (headings, lists, bold/italic, links, tables). Pasted HTML is sanitized first (Constitution IX), then `turndown` → mapper. Unsupported HTML degrades to plain text / fenced fallback (no silent truncation).

**Rationale**: No maintained, license-compatible **HTML→AsciiDoc** asset exists (only HTML→Markdown), so the clarified Principle IV permits a small first-party mapper for the part nothing provides, while `turndown` (the hard HTML-parsing part) is reused. This resolves the earlier "open item".

**Alternatives**: Vendor a full HTML→AsciiDoc converter — rejected (none exists to vendor). Hand-write the HTML parser too — rejected (IV: `turndown` already does it).

---

## R3. Diagnostics engine (US8, FR-032/033/060)

**Decision**: Add `@codemirror/lint` and implement an **async, debounced** `linter()` source that runs off the typing path. It reports: unterminated delimited blocks (from the parse tree), unknown cross-reference targets and duplicate anchor IDs (against the symbol index, R4), and undefined attribute references (against tree-wide attributes, excluding built-ins). Diagnostics are tolerant of in-progress edits (debounce + don't flag a block that is still being typed).

**Rationale**: `@codemirror/lint` is the standard, reuses gutter/underline UI, and its async source model fits a symbol index that may fetch other files. Matches FR-035 (no alarming on every keystroke).

**Alternatives**: Custom decoration-based error layer — rejected (reinvents `@codemirror/lint`).

---

## R4. Cross-file include-graph + project symbol/reference index (US8/US12, FR-046/048/061)

**Decision**: Build the index **client-side** in `apps/web`, decoupled from the preview. A `use-project-symbol-index` hook: (1) starts from `Project.mainFileNodeId`; (2) walks `include::` directives transitively (cycle-guarded) to form the document tree; (3) reads each file's **persisted content via the existing file-content API, overlaying the currently open file's live editor content** (satisfies FR-048); (4) extracts section IDs, anchors, attributes, and references into an index; (5) caches it and **invalidates incrementally on the existing file-change SSE events** and on main-file change. When no main file is configured or the open file is unreachable, scope collapses to the current file (FR-047).

**Rationale**: Keeps cross-file intelligence entirely in the editor layer, so the **preview render path and its sanitization/scroll-sync seam are untouched** (Constitution VIII). Reuses existing file-content fetch + SSE invalidation. Persisted+live overlay matches the clarified content-source decision.

**Content endpoint (resolved, U2)**: the index reuses the **existing file-content read path** already used to open a file in the editor — **no new endpoint**. The tree walk fetches each reachable file via that path, cached by the index and invalidated on SSE; the open file's content comes from the live editor buffer.

**Update (constitution 2.2.0):** preview include-assembly is **no longer rejected** — the amended Principle VIII permits it and new Principle IX enforces its security. **FR-068 (Increment D): when a main file is configured, the preview renders the assembled document with `include::` resolved.** Enforcement (Principle IX): includes resolve **only within the project storage sandbox** (reject `..`/absolute/symlink-escape paths and any remote/URL include — SSRF guard), and the assembled content is fed through the **existing sanitizer unchanged** (no parallel/relaxed path); scroll-sync regression tests required. The editor-side index (this R4) stays independent of the render path and powers completion/validation/nav regardless.

**Alternatives**: (a) Keep the preview at `safe: 'safe'` and never assemble includes — rejected: it ships a lesser feature purely to avoid VIII, which the amendment explicitly disallows. (b) Rebuild the index on every keystroke — rejected (performance); debounced idle refresh + SSE invalidation instead.

---

## R5. Main-file setting persistence (US8, FR-045)

**Decision**: Add nullable `Project.mainFileNodeId` (FK to a `FileNode`) via Prisma migration; domain `Project` entity field; `SetProjectMainFileUseCase` (validates the node exists, is an `.adoc` file in the project) returning `Result`; a port method on the project repository (+ in-memory fake); `PUT /projects/{projectId}/main-file` route with Fastify/Zod validation; a web control to pick the main file. Scoped by existing project edit permissions.

**Rationale**: It is **project configuration shared across collaborators** (Constitution VII callout) — correctly stored on the Project, not as a per-user preference. Follows the mandated clean-architecture layering.

**Alternatives**: Filename convention (e.g. `index.adoc`) — rejected per the clarified decision (explicit setting). Per-user main file — rejected (it is shared resolution context, not a personal preference).

---

## R6. Folding without a grammar Section node (US4/US10, FR-012–016b, 055–057)

**Decision**: Keep headings as flat tokens; compute **section** fold ranges in the existing `foldService` by scanning from a heading line to the next heading of the same-or-higher level (or document end). Add `LiteralBlock`/`AdmonitionBlock` to `FOLDABLE_BLOCK_TYPES`; add table folding (PSV/CSV/DSV) and conditional-region folding (`ifdef…endif`) and comment-run/attribute-run folding via dedicated fold-range producers. Copy/cut of a collapsed section needs **no special handling** — CM keeps folded text in the document model, so a selection spanning a fold includes it (verified in the audit). `{attr}` collapse-to-value (FR-057) is a separate **replace decoration**, not a fold range. Fold-all/unfold-all/to-level via `@codemirror/language` commands; persistence by serializing folded ranges to the per-user preference store (R8) keyed by user+document.

**Rationale**: Avoids a risky grammar rewrite (Constitution IV/I); reuses CM folding primitives; matches the audit's finding that collapsed-range copy already works once section folding exists.

**Alternatives**: Introduce a `Section` node wrapping heading+body in the grammar — rejected (large grammar change, ripple to highlight/outline; unnecessary for fold ranges).

---

## R7. Spell-check (US9, FR-063)

**Decision**: Reuse `nspell` + a standard `dictionary-en` (Constitution IV), driven by a CM extension that walks the syntax tree and **only checks prose ranges**, skipping listing/literal/passthrough/comment blocks, macros, attribute names, and URLs. Misspellings shown as a distinct (non-error) marker. A **per-user** ignore list (R8) lets users suppress technical terms (edge case).

**Rationale**: Mature, offline, embeddable; tree-aware skipping reuses the parse already present. Per-user ignore list respects Constitution VII.

**Alternatives**: Browser-native `contenteditable` spellcheck — rejected (CM content isn't a plain textarea; no control over skipping verbatim). Server-side checking — rejected (latency, privacy).

---

## R8. Per-user state additions (fold state, spell-check ignore list) (FR-043, VII)

**Decision**: Extend the existing `use-editor-preferences` store (localStorage + API mirror, the same mechanism as `softWrap`) with: fold state per `userId:projectId:fileId`, and a spell-check ignore list per user. Never written to document source.

**Rationale**: Constitution VII — personal, not shared; reuses the proven prefs persistence path.

**Alternatives**: Store fold state in the document/Yjs doc — rejected (VII: would mutate shared content and leak one user's folds to collaborators).

---

## R9. Header level: effective level via leveloffset, max-level cutoff, discrete headings (US3, FR-009–011, 071, 072)

**Decision**: Heading styling is driven by the **effective level**, not the raw `=` count:
- **In-file leveloffset**: a CM stateful pass tracks `:leveloffset:` entries (`+N`, `-N`, absolute, unset/`:leveloffset!:`) in document order; each heading's effective level = raw level + active offset.
- **Cross-file (inherited) leveloffset**: the offset in effect where a file is included is supplied by the include-graph (R4) — accumulated along the path from the main file, including any `leveloffset=` attribute on the `include::` directive. The heading-highlight extension consumes this inherited base offset for the open file from the symbol-index/include-graph; with no main-file context it uses 0.
- **Cutoff (FR-010)**: a line whose *effective* level exceeds the maximum (document title + standard section levels) is **not** styled as a heading. Replaces the current `>=6 ⇒ heading5` clamp.
- **Discrete headings (FR-072)**: recognize `[discrete]`/`[float]`; style as headings at the offset-adjusted level, exclude from section folding/outline, and exempt from section-sequence rules.
- **Ambiguity (resolved rule)**: when a file is included from multiple places with different inherited offsets, use the offset from the **first include encountered in document-order, depth-first traversal from the main file** (deterministic), and show a non-blocking indicator that the file appears under multiple offset contexts. This avoids guessing while staying reproducible.

**Rationale**: Effective level is what Asciidoctor actually renders; ignoring leveloffset would mis-highlight included content. Tying the inherited offset to the include-graph reuses the US8 infrastructure and is why **changing the main file refreshes heading highlighting** (R12).

**Alternatives**: (a) Raw-count level only — rejected (wrong for leveloffset/includes). (b) Clamp `>=6` — rejected (contradicts FR-010). (c) Compute inherited offset by re-parsing the whole tree on every keystroke — rejected (performance; use the cached include-graph + debounced refresh).

---

## R12. Reactive refresh on main-file / tree change (US3/US8, FR-045a)

**Decision**: The project symbol index, include graph, diagnostics, completion targets, and the heading-highlight leveloffset base are all derived from a single reactive source keyed on `(mainFileNodeId, fileContents)`. When `Project.mainFileNodeId` changes (via the API/DTO) or a file-change SSE arrives, the index is invalidated and dependents recompute (debounced). Heading highlighting subscribes to the index so a main-file change re-evaluates effective levels without a reload.

**Rationale**: Satisfies FR-045a ("changing the main file updates the data used for other features, e.g. includes and highlighting") with one invalidation path rather than ad-hoc per-feature refresh. Reuses the existing SSE file-change channel.

**Alternatives**: Refresh only on reload — rejected (FR-045a requires live refresh). Independent per-feature caches — rejected (drift, duplicate fetches).

---

## R10. Keybindings, auto-pair, snippet tab-stops (US9, FR-036–038, 041)

**Decision**: Add a CM `keymap` binding `Mod-b`/`Mod-i`/`Mod-\`` to the existing wrap actions and `Mod-/` to `toggleComment` (line token already configured). Implement auto-wrap-on-mark via an `inputHandler` that wraps a non-empty selection when a formatting mark is typed. Convert toolbar block/table/link inserts to `@codemirror/autocomplete` `snippet()` templates with tab-stops. All bindings checked to **not** override save/find/undo (FR-041).

**Rationale**: Reuses CM's command/keymap/snippet infrastructure (IV); low risk.

**Alternatives**: Custom key handling — rejected (reinvents `keymap`).

---

## R11. E2E strategy for CodeMirror (user requirement: "ensure all features are also tested with e2e tests")

**Decision**: One Playwright spec per user story under `apps/web/e2e/`, run against the isolated local stack (`scripts/e2e-local.sh`). Assertion techniques:
- **Highlighting** — assert presence of the CM token DOM classes (`.cm-…` / `data-` tags) on sample constructs.
- **Folding** — click the fold gutter, assert the body lines are hidden, unfold and assert restoration; for copy-collapsed, fold a section, select+copy, paste, assert full text.
- **Completion** — type a trigger, assert the autocomplete listbox options.
- **Diagnostics** — introduce an unterminated block / unknown xref / undefined attr, assert the lint marker; fix it, assert it clears.
- **Cross-file nav / go-to-symbol** — configure a main file with includes, activate an xref / open the symbol palette, assert the **active file switches** to the definition.
- **Preview-toggle content retention (US1, P1)** — type known text, toggle the preview several times, assert the editor content is byte-identical and cursor/scroll survive — exercised on **both** the collab and REST/offline paths.
- **Line wrap / metrics / insertion / paste / shortcuts** — drive the UI and assert the visible effect.

**Rationale**: The live-CodeMirror wiring files are intentionally low on unit coverage (quality-gates memory); e2e is the right level to prove these behaviors, and the user explicitly requires e2e for all features. Per Constitution II, **pure logic underneath each feature is still unit-tested first (red-green)**; e2e is additive, not a replacement.

**Alternatives**: Rely on unit tests only — rejected (user requirement + the wiring is only meaningfully testable end-to-end). Component tests with jsdom — rejected for editor interactions (CM needs a real layout engine; jsdom mismeasures).

---

## R13. Shared AsciiDoc model + path resolution (architecture-guard, FR-046/065/068/069/070/071)

**Decision**: Define the AsciiDoc structural contracts and pure rules **once** in `packages/shared`: `asciidoc-model/` (DTOs `Reference`/`ProjectSymbol`/`Diagnostic`/`IncludeEdge` + reference/symbol extraction + include-graph/leveloffset rules) and `project-path/resolveSandboxedPath()` (Constitution IX). The web symbol index (US8) and the domain `FindReferencesUseCase` / move-rename (US12) both import them; the editor keeps a read-only **projection** that adds CM ranges/decorations only. The move/rename result carries a typed `mainFileCleared` (shared DTO).

**Rationale**: Prevents two divergent definitions/parsers of the same concept across `apps/web` and `packages/domain` (Architecture Constitution: shared owns cross-boundary types; "no two packages define the same type"; Reuse Before Rebuild) and gives Constitution IX a single enforced path rule instead of three. The shared module is pure (no CodeMirror, no Prisma), so both a browser and a node consumer can use it.

**Alternatives**: Implement separately in web and domain (current drift) — rejected; would spread as US8/US12 land. Put the model in domain and have web call the API for every lookup — rejected (editor latency; the model is pure and belongs in shared). Phased, coexistence-based extraction is in `architecture-migration-plan.md`.

## Dependencies to add (summary)

| Package | Purpose | Constitution note |
|---------|---------|-------------------|
| `@codemirror/lint` | diagnostics (R3) | standard CM module |
| `@codemirror/language-data` | lazy source-language grammars (R1) | reuse maintained grammars |
| `nspell` + `dictionary-en` | spell-check (R7) | reuse; offline |
| `turndown` (HTML→Markdown) | paste-HTML (R2) | reuse; + small in-house MD-subset→AsciiDoc mapper |

All new dependencies must pass `pnpm audit --audit-level=high` (quality gate) and be recorded with upstream version. `highlight.js` and all `@codemirror/*` core modules are already present.
