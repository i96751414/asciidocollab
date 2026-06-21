# Quickstart: Full-Document Outline Across Includes

**Feature**: 032 | For a developer picking up implementation.

## What this feature does
Turns the per-file outline into a **whole-document map**: with a main document configured, the outline shows every heading assembled across `include::` files (live content, ≤2 s fresh), with a per-user toggle to narrow to the open file, cross-file click-to-navigate, and **section-level collaborator presence** mirroring the file tree.

## Reuse map (start here — don't rebuild)
| Need | Reuse / refactor |
|------|------------------|
| Include resolution (conditionals, partials, leveloffset, sandbox) | `workers/assemble-includes.ts` — **add** optional `withSourceMap` |
| Per-file content (live + saved fallback) | `hooks/use-project-symbol-index.ts` — `getFiles()`/`readContent` |
| Heading extraction + effective levels | `lib/codemirror/asciidoc-outline.ts`, `asciidoc-effective-levels.ts` — **unchanged** |
| Collaborator presence source | `hooks/use-project-presence.ts` — **add** `cursorLine` |
| Presence avatars / hover / overflow | `components/file-tree/open-by-others-marker.tsx`, `collab/participant-avatar.tsx` — **unchanged** |
| Per-user scope persistence | `hooks/use-editor-preferences.ts` — **add** client-only `outlineScope` |
| Navigation (same/cross file) | `use-editor-navigation.ts` (`revealLine`, `handleNavigateToFile`, `pendingXrefLine`) |

## New modules (pure, unit-test first)
- `lib/outline/assemble-outline.ts` — `assembleOutline()` → provenance-tagged `OutlineEntry[]` + effective scope.
- `lib/outline/outline-presence.ts` — `mapOutlinePresence()` → `(fileId:line) → ParticipantPresence[]`.

## Build order (TDD, red→green per Constitution II)
1. **`assemble-includes` source map** — failing test: assembled output unchanged without flag; correct `lineToSource` with flag. Then implement.
2. **`assembleOutline`** — tests: full vs current scope, effective-scope fallbacks (no main doc / unreachable open file), provenance & effective levels, conditional/partial exclusion, `unresolved` pass-through, cycle safety. Then implement.
3. **`outline-presence`** — tests: nearest-preceding-heading mapping, clamp/skip out-of-range cursorLine, dedup, multi-peer. Then implement.
4. **`useEditorPreferences.outlineScope`** — tests: default `full`, persists to localStorage, never in account PUT.
5. **`use-project-presence.cursorLine`** — tests (fake awareness): publishes on section change, aggregates peers, excludes self, old-client compat.
6. **`use-section-outline` scope** — tests (fake symbol index + view): switches scope, recomputes on reachable-doc change (fake provider), fallbacks.
7. **`OutlineView` / `EditorSectionOutline`** — component tests: scope toggle, open-file mark, presence marker rendering, cross-file vs same-file click routing.
8. **E2E (Playwright, 2 users)** — extend `e2e/editor-left-panel-outline.spec.ts`: assembly across includes, cross-file navigation, live heading edit reflected in peer outline, presence marker moves/clears.

## Manual verification (maps to Success Criteria)
- Configure a main document including 2+ child files with headings → open any file → outline shows the whole hierarchy, seamless, open file's entries marked (SC-001, FR-017/018).
- Click a heading from another file → that file opens at the heading (SC-002/005, FR-007).
- Toggle "current file only" → only open file's headings; toggle back → full; reload → choice persists (US2, FR-012).
- Project with no main document → outline shows only the open file (SC-004, FR-005).
- Two browsers: edit a heading in an included file in A → appears in B's outline within ~2 s, no save (SC-007, FR-013b).
- Move A's cursor between sections → presence marker follows on B's outline; close A → marker clears (SC-010/011, US5).

## Gotchas
- **Don't fork the sanitizer or the assembled-content output** — the source map is additive; lock it with a regression test (Principle VIII).
- **Awareness is per-document**: never try to read remote cursors of non-open files directly — they come via the project presence room's `cursorLine` (D4).
- **Clamp peer `cursorLine`** before mapping — untrusted input (Principle IX, FR-024).
- **Observer lifecycle** for reachable docs (D3): tear down on main-doc/scope change; dedupe with the already-open doc to avoid leaks.
- Performance/benchmark tests are **opt-in** and out of scope here (Constitution II); validate latency via the e2e behavioral checks.
