# Phase 0 Research: Full-Document Outline Across Includes

**Feature**: 032 | **Date**: 2026-06-21

Primary constraint from the user: *"reuse or refactor existing sources for the file tree."* Every decision below favors extending an existing first-party module over building new infrastructure. Constitution IV (Reuse Before Rebuild) requires recording that no maintained, vendorable-compatible equivalent exists for the assets we extend — noted per decision.

---

## D1. How to produce a full-document outline with per-heading provenance

**Decision**: Refactor `apps/web/src/workers/assemble-includes.ts::assembleIncludes()` to optionally return a **source map**: for each line of assembled output, the originating `{ fileId (or project-relative path), sourceLine }`. A new pure module `lib/outline/assemble-outline.ts` calls the (already reused) `useProjectSymbolIndex` content resolver + `assembleIncludes`, then runs the **existing, unchanged** `extractHeadings()` (`lib/codemirror/asciidoc-outline.ts`) / `computeHeadingLevels()` (`asciidoc-effective-levels.ts`) over the assembled text, and rewrites each resulting entry's `line`/`from` into source provenance via the map.

**Rationale**:
- `assembleIncludes` already resolves the hard parts consistently with the preview: conditional gating (`ifdef`/`ifndef`/`ifeval`), partial includes (`tags=`/`lines=`), `:leveloffset:`/`leveloffset=`, cycle/`maxDepth`/`maxExpansions` guards, and **sandbox confinement**. Running heading extraction over its output yields correct **effective levels** and the conditional/partial filtering for free.
- Keeping a **single include-resolution authority** shared with the preview prevents drift (Principle VIII spirit) and avoids re-deriving traversal logic (Principle IV).
- The change is **additive**: when the source map is not requested, assembled output is byte-for-byte identical. A regression test locks this so the preview path cannot change.

**Alternatives considered**:
- *Separate outline-only include walker* that emits headings directly with provenance (no assembled text). Rejected: duplicates conditional/partial/leveloffset logic and will drift from the preview.
- *Post-hoc title matching* (find each heading title back in source files). Rejected: ambiguous with duplicate titles and re-levelled headings.

**No vendorable equivalent**: AsciiDoc include assembly with this project's sandbox + conditional semantics is first-party; nothing on npm is compatible. Extending the in-repo asset is the sanctioned path (Constitution IV).

---

## D2. Where included-file content comes from (live vs saved) — FR-013a

**Decision**: Reuse `useProjectSymbolIndex` content access unchanged. It already:
- fetches each reachable file's content from the **live collaborative document endpoint** (`getDocumentContent(projectId, id)` → server serves the live Hocuspocus doc state), and
- overlays the **open file's** live editor text (`liveOverlay`), and
- drops stale cache on file switch.

This satisfies "live when in an active session, last-saved otherwise" because the server returns the live doc when a session exists and the persisted copy otherwise. `getFiles()` already returns the `path → content` map the outline assembler needs.

**Rationale**: Exactly the FR-013a semantics, already implemented; zero new content-sourcing code.

**Alternatives considered**: A new global file-content store — rejected (duplicates the symbol index's demand-loaded cache).

---

## D3. Near-real-time reflection of edits in non-open included files — FR-013b / SC-007 (≤2 s)

**Decision**: Add a **reachable-document change signal** that triggers a debounced (~300–500 ms) outline recompute, bounded by the ~50-file scale cap. The signal observes live updates of the files reachable from the main document by reusing the existing Hocuspocus/Yjs provider factory (the same `createProvider` seam used by `useProjectPresence`/collab): lightweight read-only observers on reachable docs emit "changed", the symbol-index cache entry for that file is invalidated, and `assemble-outline` reruns. The open file continues to update instantly from the editor doc (no fetch).

**Rationale**:
- Awareness is **per-document** and there is no server push channel for "file X content changed", so freshness for a non-open file requires either observing that doc or polling. Observing via the existing provider reuses collaboration infrastructure and comfortably meets 2 s without polling churn.
- The ~50-file cap bounds the number of observers; observers are established lazily for reachable files only and torn down when the main document/scope changes.

**Alternatives considered**:
- *Periodic refetch (poll) of all reachable files* — rejected: up to ~50 HTTP fetches per interval is wasteful and laggy.
- *Server-side broadcast of doc-change events to the project presence room* — deferred: cleaner long-term but is new server work beyond "reuse existing sources"; revisit if observer fan-out proves costly.

**Open risk** (flagged for tasks): observer lifecycle (connect/disconnect, dedupe with the already-open doc) must avoid leaks; covered by a hook test.

---

## D4. Cross-file, section/cursor-level collaborator presence — FR-019/FR-022/FR-024

**Decision**: **Refactor the existing project presence room** (`hooks/use-project-presence.ts`). Today each client publishes `{ user, openFileNodeId }` via Yjs awareness in `presenceRoomName(projectId)`. Add one field — the local user's **current section line** (the line of the heading their cursor is under, derived from the open file via existing `currentHeadingIndex`/cursor) — published as `cursorLine` (and `openFileNodeId` already present). Aggregate remote peers into a map keyed by `(openFileNodeId, headingLine)`. A new pure module `lib/outline/outline-presence.ts` maps each peer's `(fileId, cursorLine)` to the matching outline entry using the **provenance** from D1 (the entry whose source file == fileId and whose source line is the nearest heading ≤ cursorLine).

**Rationale**:
- The file tree's presence source is exactly this project presence room — refactoring it (directive: "reuse or refactor existing sources for the file tree") is the intended path.
- It **avoids subscribing to every file's editor awareness** (which is per-document and unavailable for non-open files). Each client only needs to know peers' `(file, line)`, which is cheap to broadcast and already flows through this room.
- `OpenByOthersMarker` + `ParticipantAvatar` render the avatar cluster, hover names, and `+N` overflow generically — reused unchanged on outline entries.

**Self vs others / liveness**: Aggregation already excludes the local client and dedups per user (`collectByFile`); reused so FR-020 (others-only) and FR-023 (liveness/clear on disconnect) hold without new logic. The local user's own position is shown via the existing current-section indication (FR-011/FR-018), not a presence marker.

**Security (Principle IX)**: `cursorLine` from peers is untrusted → clamp to `[1, lineCount]` and treat a missing/out-of-range value as "no section" before mapping. Never index a non-existent entry (FR-024).

**Alternatives considered**:
- *Subscribe to each included file's editor awareness to read remote cursors* — rejected: per-document, heavy, and a client viewing file Y has no awareness session for file X.
- *File-level presence only* (mark the file's top entry) — rejected by clarification Q6 (section/cursor-level chosen).

---

## D5. Outline scope option persistence — FR-012

**Decision**: Add a **client-only** preference `outlineScope: 'full' | 'current'` to `hooks/use-editor-preferences.ts`, listed in `CLIENT_ONLY_KEYS` exactly like `leftPanelTab` (028) and `showIncludedFiles` (029): persisted to `localStorage`, never PUT to the account, kept on fetch-merge. Default `'full'` (spec assumption: full-document is the default when available).

**Rationale**: Identical shape to two existing client-only prefs — minimal, consistent, satisfies Principle VII (per-user, this device, no shared mutation). When no main document exists or the open file is unreachable, the effective scope falls back to current-file regardless of the stored value (FR-005/FR-006).

**Alternatives considered**: Account-synced preference — rejected: heavier (server DTO change) and inconsistent with sibling outline/preview prefs.

---

## D6. Navigation from an assembled outline entry — FR-007 / FR-008

**Decision**: Reuse the existing navigation seam. With provenance on each entry:
- entry's source file == open file → `revealLine(sourceLine)` (`use-editor-navigation.ts`).
- otherwise → set `pendingXrefLine` and `handleNavigateToFile(sourcePath)`; the existing restoration path applies the line on mount (the same mechanism cross-references already use).

**Rationale**: The cross-file "open file then jump to line" pattern already exists for xref navigation — no new navigation code, only feeding it the entry's provenance.

---

## D7. Marking the open file's entries (FR-018) and current section (FR-011)

**Decision**: Provenance (D1) tells which entries originate from the open file → apply the existing open-file marking style. The current section is computed by `currentHeadingIndex` over the open file's cursor mapped onto the assembled entries (restricted to open-file entries). Both reuse existing outline rendering affordances (`aria-current`, indent), now provenance-aware.

---

## D8. Testing strategy (Constitution II/III)

- **Unit (Jest)**: `assemble-includes` source-map correctness + no-output-change regression; `assemble-outline` provenance & effective levels (in-memory `readFile` fake); `outline-presence` cursor→entry mapping incl. clamp/out-of-range; preference default/persistence.
- **Hook (RTL `renderHook`)**: `use-section-outline` scope switching + fallbacks; `use-project-presence` cursorLine publish/aggregate (fake awareness `getStates`); reachable-doc change → recompute (fake provider).
- **Component (RTL)**: `editor-section-outline` renders presence marker (reused `OpenByOthersMarker`), open-file/current marks; `outline-view` scope toggle + empty/fallback states.
- **E2E (Playwright, multi-user)**: extend `editor-left-panel-outline.spec.ts` + patterns from `collab-awareness.spec.ts` — full-document assembly, cross-file navigation, live heading edit reflected ≤ a couple seconds, presence marker moves/clears.
- **Performance/load tests**: OPT-IN, **not added** (spec did not explicitly request them; Constitution II). Latency SCs validated by the e2e behavioral checks above.

---

## Resolved unknowns

| Unknown | Resolution |
|---------|-----------|
| Provenance for cross-file nav & presence | Source map from `assembleIncludes` (D1) |
| Live vs saved content | Already provided by `useProjectSymbolIndex` (D2) |
| 2 s freshness for non-open files | Reachable-doc observers + debounced recompute (D3) |
| Cross-file cursor presence transport | Extend project presence room with `cursorLine` (D4) |
| Scope persistence | Client-only pref in `useEditorPreferences` (D5) |
| Cross-file navigation | Existing `pendingXrefLine` + `handleNavigateToFile` (D6) |

No NEEDS CLARIFICATION remain.
