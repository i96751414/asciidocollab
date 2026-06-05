# Research: AsciiDoc Code Editor

**Branch**: `014-codemirror-editor` | **Date**: 2026-06-04

---

## Decision 1: Lezer Grammar Strategy for AsciiDoc

**Decision**: Hand-authored Lezer LR grammar (`.grammar` file compiled via `@lezer/generator`), covering the subset defined in FR-ED-002. Incremental error recovery enabled on all block-level rules.

**Rationale**:
- CodeMirror 6 is mandated by the Architecture Constitution. Its native grammar format is Lezer; adapting a TextMate grammar would produce a tokeniser, not a full parse tree, losing structural information needed for folding, section outline, and cross-reference completion.
- There is no published AsciiDoc Lezer grammar. Upstream asciidoctor.js uses a separate parser not suitable for editor integration.
- AsciiDoc's document model is line-oriented at the block level and span-oriented at the inline level. This maps well to an LR grammar with a two-pass strategy: block structure is parsed first (headings, block delimiters, table rows), inline marks are parsed within block content tokens.
- The grammar will use `@skip` rules for whitespace and rely on Lezer's built-in error-recovery (`@recoverWith`, `@specialize`) to handle unterminated blocks gracefully.

**Alternatives considered**:
- _TextMate grammar via `@codemirror/language`'s `StreamLanguage`_: Rejected — produces only token-level highlighting, no parse tree for structural features (folding, outline, completions).
- _Importing asciidoctor.js parser_: Rejected — ~2 MB bundle, not designed for character-by-character re-parsing, would freeze on every keystroke.
- _Full AsciiDoc spec coverage_: Deferred — the full spec (nested macro call parsing, conditional includes, complex table column DSL) would triple grammar complexity. The FR-ED-002 subset is sufficient for phase 6.

---

## Decision 2: Minimap Implementation

**Decision**: Use `@uiw/codemirror-extensions-minimap` (community extension wrapping a CodeMirror 6 `ViewPlugin`).

**Rationale**:
- The most actively maintained CM6 minimap extension as of mid-2025; ~2k weekly downloads, MIT licence, TypeScript types included.
- Implemented as a proper CM6 extension (not DOM overlay), so it participates in the editor's transaction/state model and scrolls in sync with the viewport without additional coordination logic.
- Configurable canvas size and render colours via extension options — can be themed alongside the rest of the editor.

**Alternatives considered**:
- _Custom `ViewPlugin`_: Viable but would require significant canvas rendering work. Deferred to later if the community extension proves insufficient.
- _`codemirror-minimap` (separate package)_: Older, less maintained, no TypeScript types. Rejected.

---

## Decision 3: External Change Notification (FR-AS-005)

**Decision**: Polling via a lightweight HEAD request to the existing file content endpoint, using the `ETag` header (mapped to the document's `contentId`) at a 30-second interval. A non-blocking toast is shown when the remote version diverges.

**Rationale**:
- The project already has an SSE event bus (`apps/api/src/plugins/file-tree-event-bus.ts`) but it currently emits tree-structure events (create, rename, delete, move), not document content change events. Extending it for document saves would be the right long-term solution and should be done in the collaboration phase (FR-005).
- For this phase, polling is simpler, safe, and imposes negligible load (one HEAD request per open file every 30 s).
- The `contentId` (a UUID bumped on every save in `SaveDocumentContentUseCase`) is a natural version token. The API's `GET /projects/:projectId/files/:fileNodeId/content` response can include this in an `ETag` header without additional schema changes.

**Alternatives considered**:
- _Extend the SSE event bus with document-change events_: Correct long-term direction but higher scope. Deferred to the collaboration phase.
- _WebSocket per-file subscription_: Overkill for a single-user phase.

---

## Decision 4: Auto-Save Debounce Configuration

**Decision**: The debounce period is exposed as a `NEXT_PUBLIC_EDITOR_AUTOSAVE_DEBOUNCE_MS` environment variable in `apps/web`, defaulting to `4000`. This is injected at Next.js build time and read as a named constant in the `useAutoSave` hook.

**Rationale**:
- "Application-level configurable" (spec A-009) means an administrator or deployment engineer can change it at deploy time. A `NEXT_PUBLIC_` environment variable achieves this without any new API endpoints.
- Avoids a round-trip to the backend on editor load purely for a timing constant.
- Easy to override in test environments (`NEXT_PUBLIC_EDITOR_AUTOSAVE_DEBOUNCE_MS=0` for E2E tests to disable debouncing).

**Alternatives considered**:
- _New `/api/config` endpoint_: Adds backend complexity for a single integer. Rejected.
- _SystemSetting in DB (like open-registration toggle)_: Appropriate only if real-time live changes are needed without redeployment. Deferred.

---

## Decision 5: Editor Preferences Storage

**Decision**: Full stack — domain entity `EditorPreferences` with a Prisma-backed repository, exposed via two new API endpoints (`GET`/`PUT` on `/users/me/editor-preferences`). localStorage is used as a write-through cache to apply preferences immediately on load without waiting for the API.

**Rationale**:
- The spec requires preferences to persist across browser sessions AND across devices/browsers, which rules out localStorage-only storage.
- The existing keybinding feature (`KeyBinding` entity, `get-key-bindings` use case, `prisma-key-binding.repository.ts`) establishes the exact pattern to follow — the `EditorPreferences` entity is analogous.
- localStorage cache eliminates the flash of default settings on page load.

**Alternatives considered**:
- _localStorage only_: Rejected — preferences lost when switching browsers or clearing storage, violating the spec requirement.
- _Add fields to the `User` entity_: Rejected — would pollute the user entity with UI concerns and require user-schema migration every time a new preference is added.

---

## Decision 6: Include Path Completion Data Source

**Decision**: The include-path completion provider calls the existing file-tree GET endpoint (`/projects/:projectId/tree`) to retrieve the full project file list, caches the result in React state for the session lifetime of the editor, and filters it client-side against the prefix the user has typed.

**Rationale**:
- The file-tree endpoint already returns the full recursive tree structure; no new API work is required.
- Caching for session lifetime is correct because tree changes (file create/rename/delete) are already reflected via the SSE event bus, which the file-tree component subscribes to. The completion cache can be invalidated on the same events.
- Client-side prefix filtering is O(n) on the tree size, which is acceptable given typical project sizes (< 10 000 files).

**Alternatives considered**:
- _Dedicated `/projects/:projectId/files?prefix=...` query endpoint_: Better at massive scale but unnecessary complexity for the expected project sizes.

---

## Decision 7: Toolbar Overflow Strategy

**Decision**: The toolbar is divided into four named groups (Text Formatting, Structure, Blocks, Inline/References) rendered as horizontal icon button clusters separated by dividers. Groups that overflow the viewport collapse into a dropdown labelled "More…" using a ResizeObserver measurement approach.

**Rationale**:
- All FR-EC-001 actions must be reachable on standard 1280px desktop viewports. The groups approach lets users learn where to find actions by category and degrades cleanly on narrower viewports.
- A full command palette (Ctrl+Shift+P style) is deferred to post-launch (spec A-007) but the toolbar's structure makes it easy to add later.

---

## Resolved NEEDS CLARIFICATION

*None remained in the spec after user Q&A — all items were resolved before this plan was started.*
