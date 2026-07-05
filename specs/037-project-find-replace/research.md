# Phase 0 Research: Project-Wide Find and Replace

All decisions below resolve the Technical Context and the `/speckit-plan` request (security, clean architecture/SOLID, and correct replacement with vs. without an open Yjs session).

## D1. Dual write-back path (open session vs. no session) — REUSE the rename/apply-edits spine

**Decision**: Do not write files directly. Route every replacement through the **Yjs source of truth** using the collab server's `openDirectConnection`, exactly as `RenameSymbolUseCase` already does. The plain-text file store is only written directly for files that have **no `Document` record at all** (never opened); every other file goes through the collab apply path.

**Rationale** (verified in code):
- `apps/collab/src/apply-edits.ts` → `openDirectConnection(projectId/yjsStateId)` **attaches to an open room** (live editors see the edit instantly) **or loads a dormant room from authoritative Yjs state** (never the stale plain-text file); `disconnect()` forces the normal writeback (Yjs blob + plain text) and unloads if nobody else is connected. This *is* the "with/without open session" handling — one path, no branching on session state (FR-010, FR-011).
- `packages/domain/src/ports/storage/collaborative-content-editor.ts` documents the invariant: a direct file-store write to a live file is invisible to editors and clobbered by the next writeback. So the file store is a projection, not a write target for open docs.
- The plain `PUT …/content` (`SaveDocumentContentUseCase`) **returns 409 while a session is active** — it is the wrong primitive for bulk replace and is not used.
- Read/scan side reuses `resolveFileContent`/`liveContentDeps` (`live-content.ts`): live Yjs text when a room exists, else the file store — so search reflects unsaved live edits (FR-007) and matches what collaborators see.

**Alternatives considered**:
- *Write the file store and let Yjs reconcile* — rejected: silently reverted by the next writeback; corrupts live sessions.
- *Open a full Hocuspocus client connection per file* — rejected: `openDirectConnection` is the server-side, connection-less primitive already built for this.

## D2. Structured (selection- and regex-aware) apply — EXTEND `apply-edits.ts`, don't reuse the literal port

**Decision**: Introduce `applyStructuredReplacementToDocument` on the collab side (and a `StructuredCollaborativeEditor` domain port + `HttpStructuredCollaborativeEditor` infra adapter). It re-runs the query against the **current live Y.Text inside the direct-connection transaction**, computes exact match spans, and rewrites only the **confirmed selection**, right-to-left so offsets stay valid. Selection is expressed as, per file, a set of `{ ordinal, expectedText }` entries; a span whose live text no longer equals `expectedText` (or whose ordinal no longer exists) is skipped (FR-017).

**Rationale**: The existing `applyReplacements` port is *occurrence-global literal* — "replace every occurrence of `find` with `replace`". That is correct for symbol rename (unique macros) and for a literal replace-all-in-file with no exclusions, but it cannot express (a) **regex capture-group substitution** (per-match replacement text differs) or (b) **per-match include/exclude** (FR-008a) where identical text is selected in one place but not another. Re-matching *inside the transaction* collapses the scan→apply concurrency window to the atomic Yjs transaction, so positional edits are safe there even though positions computed at scan time would not be (this is why the literal port avoided positions — the structured path solves it differently, by re-matching late rather than trusting early offsets).

**Alternatives considered**:
- *Reuse literal `applyReplacements` for everything* — rejected: over-replaces on exclusions, cannot do capture groups.
- *Send scan-time absolute offsets to the collab side* — rejected: offsets are invalid after any concurrent edit; violates FR-011.
- *Fork the literal port to add positions* — rejected: the structured path is a first-party **extension** of `apply-edits.ts`, keeping one Yjs-authoritative write path (Principle IV, VIII).

**Fast-path note**: A literal, whole-file, no-exclusions replace *could* still map to the existing `applyReplacements`. To avoid two write paths and their divergence, v1 routes **all** find/replace through the structured primitive (the literal case is just "all ordinals selected, empty capture template"). Optimizing to the literal port later is a non-behavioral change.

## D3. Regex engine — RE2 (linear-time), injected via a domain port

**Decision**: Add a `RegexEngine` domain port (`compile(pattern, flags) → Result<CompiledMatcher, ValidationError>`, matcher exposes bounded iteration of match spans + capture groups). Implement it in infrastructure with **RE2** (the `re2` Node binding) and use the same adapter on the collab side for in-transaction re-matching. The domain never imports RE2 (zero-dependency rule); literal and whole-word matching are pure and need no engine.

**Rationale**: User-supplied patterns are untrusted (Principle IX). RE2 is a finite-automaton engine with a **linear-time guarantee — catastrophic backtracking is structurally impossible** (SC-008), satisfying the security constitution's "regexes MUST be linear-time" rule for the runtime path (our own source regexes are already covered by `eslint-plugin-redos`). Injecting via a port keeps the domain pure and testable with an in-memory fake engine (Principle III), and lets search (API) and apply (collab) share identical match semantics through the pure `text-match.ts` helper.

**Tradeoff (accepted)**: RE2 drops backreferences and lookaround. This is documented to the user and is the price of guaranteed non-runaway evaluation. Baseline literal + case + whole-word needs no engine at all.

**Alternatives considered**:
- *JS `RegExp`* — rejected: backtracking → ReDoS across every project file; cannot be safely bounded (a synchronous match can't be interrupted).
- *WASM oniguruma / vscode-textmate regex* — rejected: heavier, still backtracking semantics; RE2 is the direct, well-licensed fit.
- *Custom automaton* — rejected: reuse-before-rebuild (Principle IV); re-deriving a regex engine invites bugs.

## D4. Searchable file set — text-decodability by content, not extension

**Decision**: A `searchable-text-file` predicate decides membership by **content detection** (does the bytes decode as UTF-8 text / contain no NUL and pass a simple heuristic), not by file extension (FR-003b). Binary/attachment files are excluded. Files exceeding `maxFileBytes` are excluded from match evaluation and reported as skipped.

**Rationale**: The spec clarification chose "any text-decodable file, regardless of extension." The existing symbol scan filters `isAsciiDocumentFileName` (too narrow here). Content sniffing (NUL-byte / UTF-8 validity, optionally the existing `mime-type` value object) is predictable enough and avoids maintaining an extension allow-list.

**Alternatives considered**: extension allow-list (rejected — misses `.csv`, `.json`, extensionless text the user expects); AsciiDoc-only (rejected — narrower than the spec).

## D5. Result cap & selection semantics

**Decision**: Cap displayed matches at `maxMatchesReturned` (~1,000) while always returning the **true total** and a `capped` flag; the client prompts to refine (FR-016). Per-match selection (include/exclude, FR-008a) is tracked client-side over the returned matches and sent to replace as per-file `{ordinal, expectedText}`; excluded matches are simply absent from the request.

**Rationale**: Bounds payload and render cost (SC-002/SC-008) without lying about scope. Ordinal+expectedText is the concurrency-robust identity used by the structured apply (D2).

## D6. Reversibility — per-file editor undo (no atomic bulk-undo)

**Decision**: No dedicated cross-file rollback. Each affected file's replacement is a normal Yjs edit, undoable through that document's own editor undo history (FR-018). Preview + confirmation (FR-008a/FR-009) is the pre-commit safeguard.

**Rationale**: An atomic multi-file rollback is racy against concurrent edits made after the replace and would need snapshotting outside the CRDT model — high cost, low correctness. Deferred by the spec clarification.

## D7. In-editor find/replace restyle — theme the stock panel, keep behavior

**Decision**: Keep `@codemirror/search`'s `search({ top: true })` and `searchKeymap` (behavior/shortcuts unchanged, FR-014 assumption), and attach a CodeMirror theme extension (`search-panel-theme.ts`) that styles `.cm-search`/`.cm-panel` controls from **design tokens**, correct in light/dark. Match the Search tab and `FindPanel` visual language.

**Rationale**: Reuse-before-rebuild (keep the working panel + keymap); the gap is purely visual (research confirmed the panel is currently unstyled). Theming via tokens satisfies Principle V; it is app chrome, so Principle VI is N/A.

**Alternatives considered**: a fully custom React find/replace panel (rejected for v1 — more surface, risks scroll-sync/keymap regressions for no functional gain).

## D8. Rate limiting & config — new `project.search.*` block

**Decision**: Add a `project.search` config block (search + replace budgets, match cap, per-file/pattern budgets), env-overridable, and apply per-route limits on `POST /projects/:id/search` (read budget) and `POST /projects/:id/replace` (conservative write budget), mirroring `project.refactoring`.

**Rationale**: Both routes fan out over the whole project → the security constitution *requires* a limit (amplifying/bulk). Limits MUST be configurable, never hardcoded. Decoupled read/write budgets so search typing never starves replace and vice-versa.

## D9. Propagation to open dependents — reuse existing behavior (no new work)

**Decision**: Rely on the existing propagation. A file **open in an editor** receives the replacement live through its Yjs binding (the direct-connection edit propagates through the room). **Dependent, non-open** views (preview of other files, symbol index) already refresh via the `content-changed` SSE that the collab `change-notifier` and the writeback emit.

**Rationale**: Verified in research — no new event or client rebind is needed; this is the same pattern feature 036 established.
