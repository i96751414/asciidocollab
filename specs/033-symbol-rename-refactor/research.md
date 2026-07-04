# Phase 0 Research: In-Editor Symbol Rename Refactor Suggestion

All Technical Context unknowns are resolved below. Each entry: Decision / Rationale / Alternatives considered.

## R1. Detection & apply — reuse vs rebuild

- **Decision**: Reuse the existing `FindReferencesUseCase` (`GET /projects/:projectId/symbol-usages`) for detection/counting and `RenameSymbolUseCase` (`POST /projects/:projectId/symbol-rename`) for apply. No parallel path.
- **Rationale**: These already provide whole-project scope, live Hocuspocus/Yjs integration (`collaborativeContentEditor`, `document` repo), domain-enforced authorization, and audit logging — exactly the guarantees FR-006a, FR-018a, FR-023, FR-024 require. The spec (FR-018a) mandates reuse.
- **Alternatives considered**: (a) A new client-only whole-project index for detection — rejected: `useProjectSymbolIndex` is include-tree scoped, not whole-project, and duplicating server scan logic risks drift (Principle IV). (b) A new bulk-rename endpoint — rejected: recreates existing capability.

## R2. Hocuspocus/live-content handling — already solved

- **Decision**: Rely on the existing use cases' live-content integration; do not add a new collaborative apply path.
- **Rationale**: `find-references` already scans live Yjs content for open collab rooms (so a just-typed unsaved usage is found), and `rename-symbol` routes rewrites through Yjs for live files and the file store otherwise. This satisfies the clarified answers (Q1/Q2) directly. The spec's "if it does not support collaborative updates, it MUST be fixed" branch is therefore **not triggered** — verify with an integration test rather than building anything.
- **Alternatives considered**: Opening a collab session per affected file from the client — rejected: heavier and diverges from existing server code.

## R3. Detecting a "rename" at the definition site

- **Decision**: On entering/editing a symbol definition, capture the **old name** as the definition's name at edit-start (before the change). Treat subsequent edits within that definition token as producing the **new name**. Reuse `asciidoc-symbol-at-cursor.ts` to classify the token (anchor / attribute / heading) and locate the definition.
- **Rationale**: FR-002 requires a baseline old name to search for; capturing at edit-start is the only reliable way to know what to refactor once the text has changed. Definition-site-only (FR-004) keeps detection unambiguous.
- **Alternatives considered**: Diffing document versions to infer renames — rejected: ambiguous and expensive; can't distinguish rename from delete+add.

## R4. Timing & location state machine (2s show / live update / 5s hide-on-leave / re-show on return)

- **Decision**: Implement a CodeMirror `StateField` + `ViewPlugin` state machine with two timers: a **2s settle timer** (reset on every change to the name; on fire, request/refresh the suggestion for the latest name) and a **5s leave timer** (started when the cursor leaves the definition region; cancelled if the cursor returns before it fires; on fire, hide). Auto-dismiss immediately when the name reverts to original, apply completes, or the old name has no other occurrences (FR-015).
- **Rationale**: Directly encodes FR-010–FR-016 as independently testable transitions. Timers live in view state so they don't block typing (FR-025).
- **Alternatives considered**: Debounce-only (no leave/return handling) — rejected: fails FR-013/FR-014.

## R5. Suppression when nothing to refactor (Q clarify: zero other occurrences)

- **Decision**: Offer a suggestion only when the old name has **≥1 other occurrence anywhere in the project** — a reference or another same-named definition — outside the edited definition (FR-003). The authoritative count comes from `symbol-usages` (whole-project, live-aware).
- **Rationale**: Matches the clarified rule ("do not suggest a refactor if there are no other symbols anywhere else") and avoids noise for brand-new symbols.
- **Note**: A cheap client-side pre-check against the local include-tree index MAY short-circuit obvious "has usages" cases to reduce server calls, but the *decision to show* is confirmed by the whole-project server result.

## R6. Section-heading auto-generated IDs (US3) — the one real server gap

- **Decision**: Extend the refactor path to a heading/section-derived-ID rename. Preferred approach: detect the heading's derived ID change client-side, and drive it through the existing rename use case by adding a `symbolKind` that targets the derived ID (or mapping it onto the `anchor` kind against the derived id), **only** when the heading has no explicit ID and its derived ID is referenced elsewhere (FR-005). Preserve authorization + `AUDIT_SYMBOL_RENAMED`.
- **Rationale**: The existing endpoints accept only `anchor | attribute`; headings are in scope per the clarified answer. Deriving the ID the same way the preview/index already does keeps consistency.
- **Alternatives considered**: Rewriting heading xrefs purely client-side — rejected: bypasses domain authz/audit (security-constitution violation).

## R7. Rate-limit budget for the detection path (security)

- **Decision**: Add a separate, YAML/env-configurable **detection (read) budget** (`project.refactoring.suggestionRateLimit{Max,Window}`, default 600/hour) applied to `symbol-usages`; keep the existing 60/hour budget for `symbol-rename` (apply). Reduce calls via the 2s debounce and per-(kind, oldName) result caching.
- **Rationale**: Proactive detection is an amplifying fan-out read fired far more often than the manual dialog; the security constitution requires such routes to be rate-limited with **configurable** (not hardcoded) limits. Decoupling read/write budgets prevents detection from starving apply.
- **Alternatives considered**: (a) Raising the single shared limit — rejected: couples apply throttling to detection volume. (b) No limit on detection — rejected: violates the security constitution (amplifying route).

## R8. Undo — single atomic step (clarify Q3 = A)

- **Decision**: Model undo as a single reversible operation restoring every rewritten usage. Investigate whether `RenameSymbolUseCase` can expose an inverse (rename new→old across the same file set) invoked as one user action; if a truly atomic multi-document/collaborative undo is infeasible, the inverse-rename is applied as one operation and presented as one undo step.
- **Rationale**: The author chose atomic single-step undo (FR-020). The inverse-rename reuses the same authorized, audited path.
- **Risk/Note**: Yjs per-document history makes a cross-document transactional undo hard; the inverse-rename-as-one-action is the pragmatic realization of "one step" and MUST be covered by an e2e test asserting full restoration.

## R9. Theming & pipeline integrity

- **Decision**: The inline suggestion widget derives all colors from design tokens (Principle V), renders only inside editor chrome (never the preview surface, Principle VI/VIII), and is covered by an e2e assertion that scroll-sync is unaffected (Principle VIII).
- **Rationale**: Constitution gates V/VI/VIII.

## R10. Always-in-memory server-side symbol index vs. per-file parse cache

- **Decision**: Do **not** build an always-resident, keystroke-updated server symbol index for this feature. If lookup cost proves to matter, add a **bounded per-file parse cache** keyed by `(fileId, contentVersion/hash)` in the API process (memoize `extractSymbols`/`extractReferences` per file; a changed file bumps its version; a cache miss recomputes). Reserve a full "project symbol service" as a future, separately-justified investment.
- **Rationale / topology facts**:
  - Only the **collab (Hocuspocus)** process sees live keystrokes; it holds Y.Docs in memory **only for files with a connected client** — dormant files are not resident. The **API** serves `symbol-usages`/`symbol-rename` and never sees keystrokes (reaches live content via the internal HTTP edit bridge). Neither service is clustered today.
  - Current `find-references` re-parses **every** AsciiDoc file per call; there is **no** server-side cache. So the cost the user is worried about is real, especially since proactive detection fires the read path frequently.
  - **Pros of an always-on index**: O(1) lookups (removes the fan-out scan → softens the detection rate-limit pressure), instant FR-003 suppression check, and reuse by outline/autocomplete/diagnostics.
  - **Cons**: (a) live-doc-only coverage cannot satisfy the clarified **whole-project** scope — a persisted-file index is still required; (b) a stale index yields a **wrong refactor** (silent document corruption) — correctness stakes far exceed an outline's; (c) must be **incremental/debounced per-file**, never a per-keystroke whole-project re-scan, and there is no per-keystroke hook (only debounced `onStoreDocument`); (d) two update paths to keep consistent (live edits via collab, rename/dormant rewrites via the file store); (e) memory growth + single-instance coupling / future sharding.
- **Why the per-file cache wins for now**: captures most of the speed-up (unchanged files never re-parsed) with no correctness cliff (a miss just recomputes) and minimal new state. It also compounds with the R7 detection rate-limit budget: cheaper reads make the budget go further, though the limit is still required for abuse protection.
- **Alternatives considered**: (a) Full always-on index in collab — deferred (justified only when several features share it, under single-instance assumption, with eviction + rebuild-on-miss). (b) Client-only index for detection — rejected for the decision-to-show because the client index is include-tree scoped, not whole-project.

## Open items deferred to planning-of-tasks (non-blocking)

- Exact cursor "vicinity" that counts as being "at" the renamed symbol for the 5s return rule (spec Assumption) — pick the definition line/token region; finalize in tasks.
- Whether to surface a lightweight client pre-check (R5) or always defer to the server — decide during implementation based on measured call volume.
