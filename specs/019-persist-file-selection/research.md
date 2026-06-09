# Phase 0 Research: Persist & Restore File Selection

No `[NEEDS CLARIFICATION]` markers remained in the spec. The spec documented one open scope assumption (same-browser vs cross-device persistence); this research resolves it and the supporting design decisions.

---

## Decision 1 — Persistence medium: client-side `localStorage` (not server-backed)

**Decision**: Persist the per-user, per-project last selection in browser `localStorage` under `asciidocollab:last-selection:<userId>:<projectId>`, holding the selected file's identity and (for AsciiDoc) the last cursor line. The key is scoped by `userId` (resolved server-side via `getProjectAccess`/`/auth/me` and passed into the layout) so accounts sharing a browser profile stay isolated (FR-011).

**Rationale**:
- Matches the spec's documented MVP assumption (restore on the same browser; cross-device deferred).
- Mirrors existing patterns already in `apps/web`: editor drafts live in `localStorage` (`asciidocollab:editor-draft:<nodeId>`) and preview-open state in `sessionStorage` (`asciidoc-preview-open`).
- Zero backend surface ⇒ no API route, no Prisma schema change, no migration-policy trigger, no new authorization path. Smallest correct change.
- Synchronous reads/writes are sub-millisecond, satisfying SC-003 (restore < 1s) without network latency.

**Alternatives considered**:
- **Server-backed (extend `/auth/me/editor-preferences`-style endpoint)** — would enable cross-device restoration and survive cache clears. Rejected for the MVP: adds an API route, DTO in `packages/shared`, persistence column, and a write on every cursor move (debounced) for marginal benefit over the stated requirement. Explicitly recorded as the future-enhancement path if cross-device is later required (would reuse the same `useLastSelection` interface, swapping the storage backend).
- **URL query param (`?file=<id>&line=<n>`)** — survives reload and is shareable, but is lost when navigating to a sibling route (Settings/Members) because those are separate routes, so it does not satisfy FR-002 for the primary journey. Also pollutes shared URLs with another user's cursor. Rejected.
- **`sessionStorage`** — cleared when the tab/browser closes, failing FR-007 (survive browser restart). Rejected.

---

## Decision 2 — Capturing the cursor line

**Decision**: The editor already computes the cursor line in `useEditorMount`'s `updateListener` (`onCursorChange({ line, col, totalLines })`). Surface that line up to `ProjectEditorLayout` via a new `onCursorLineChange?(line)` prop on `AsciiDocEditor`, debounced (~500ms, consistent with `use-editor-preferences`) before writing to `localStorage`.

**Rationale**:
- Reuses the existing cursor computation — no new CodeMirror listeners.
- Debouncing avoids a `localStorage` write on every keystroke/arrow press while keeping the value fresh enough that the latest position is restored (FR-008).
- Keeps the editor presentational: it reports position; the layout owns persistence.

**Alternatives considered**:
- Persist directly inside the editor — rejected; couples a leaf component to project-scoped storage and to the `projectId`. The layout already owns selection/persistence concerns.
- Persist on unmount only — rejected; an abrupt tab close or crash would lose the position, and React unmount ordering on route change is less reliable than a live debounced write.

---

## Decision 3 — Restoring the cursor line (and "closest line" semantics)

**Decision**: Add an optional `initialLine` to `useEditorMount`. After the `EditorView` is created on mount, if `initialLine` is provided, dispatch a selection to the start of that line with `scrollIntoView: true`, clamping the target to `Math.min(Math.max(initialLine, 1), state.doc.lines)`.

**Rationale**:
- The editor is keyed by `nodeId` and remounts per file, so the mount effect is the natural, race-free place to apply an initial position (the doc is already in state).
- Clamping to `[1, doc.lines]` implements the spec's "closest still-valid line" for shortened documents (FR-005) with no error.
- `scrollIntoView` ensures the line is visible, satisfying "scroll that line into view".

**Alternatives considered**:
- A separate effect watching `initialLine` after mount — rejected; risks a visible jump (mount at top, then scroll) and re-firing on prop identity changes.
- Restoring exact column/scroll-offset/selection range — out of scope per spec assumptions; line granularity only.

---

## Decision 4 — Restore-once semantics (avoid surprise re-jumps)

**Decision**: Apply `initialLine` only for the **initial restoration** when the layout first mounts and the persisted file is auto-selected. Subsequent in-session selections (user clicking files in the tree) pass no `initialLine`. Track this with a one-shot ref (`hasRestoredReference`).

**Rationale**:
- The feature's intent is "resume where you left off when you *return to the project*" (cross-page navigation / reload), not to hijack ordinary in-app clicks.
- Avoids the confusing case where re-clicking the remembered file mid-session yanks the cursor to an old line.

**Alternatives considered**:
- Always jump to the remembered line whenever the remembered file is opened — simpler, and arguably a nice "resume" behavior, but can surprise users during normal editing. Recorded as a possible follow-up if desired; default to restore-once for predictability.

---

## Decision 5 — Validating the restored file & graceful fallback (FR-009 / US3)

**Decision**: On restore, optimistically call the existing `selectFile(persisted...)`. Enhance `useFileSelection` to check `response.ok` on the content fetch and expose a `notFound` signal (currently it reads the body unconditionally). When a **restore** triggers `notFound` (e.g. HTTP 404 — file deleted/moved so its id changed), clear the `localStorage` entry and reset to the no-file-selected state.

**Rationale**:
- The content endpoint is already authenticated and project-scoped, so a missing/forbidden node yields a non-OK response — the authoritative existence check, no separate "does this node exist" call needed.
- Clearing stale memory satisfies "not retried on future visits" (US3 scenario 2) and prevents an error state from a forged/old id (security: invalid ids cannot escalate; they fall back).

**Alternatives considered**:
- Validate the persisted id against the loaded file-tree node list — would require lifting the tree's data out of `FileTree` (currently self-fetching), a larger, more invasive change. Rejected in favor of the existing fetch as the source of truth.

---

## Decision 6 — Robust, type-safe storage access

**Decision**: Wrap all `localStorage` reads/writes in `try/catch` and validate parsed JSON with a type-guard (narrowing `unknown` → expected shape), defaulting to "no memory" on any failure — exactly the pattern in `use-editor-preferences.ts` (`isStoredPrefs`, `loadFromStorage`).

**Rationale**:
- `localStorage` can throw (private mode, quota, disabled) and can contain arbitrary/old/forged JSON. The constitution forbids `any`/`as`; a type guard satisfies FR-010 (never block/error) and the P0 architecture rules.

**Alternatives considered**: none — this is the established codebase convention.

---

## Decision 7 — Revealing the restored file in the tree (FR-012)

**Context**: The tree's `expandedState` starts empty and a one-shot effect expands only **top-level** folders on first load (`file-tree.tsx`). A `revealSelected(nodeId)` helper that expands a node's ancestors already exists in `useFileTreeUIState`, plus a scroll-into-view routine (`handleRevealFile`) — but they are only invoked by the manual "Reveal in tree" action. A programmatically restored selection deeper than the top level would load content yet stay hidden/unhighlighted.

**Decision**: Extend `FileTree` to **auto-reveal whenever `selectedNodeId` changes to a node that is not currently visible**: call the existing `revealSelected(selectedNodeId)` (expand ancestors) and scroll the node into view. The effect keys on `selectedNodeId` (and `tree`), **not** on `expandedState`. Track the last-revealed id with a ref to avoid redundant work. `useFileTreeUIState` / `revealSelected` are reused unchanged.

**Rationale**:
- Chosen behavior ("always reveal external selections") is more robust than a restore-only one-shot: it serves restore today and any future caller that sets `selectedNodeId`, while a `selectedNodeId`-keyed dependency means manually collapsing a folder that holds the already-selected file does **not** re-trigger a reveal (FR-012's "must not fight the user").
- Keying on `tree` too handles the async race: `FileTree` fetches its own tree independently of the layout's restore, and `revealSelected` no-ops while `tree` is null; re-running once the tree arrives guarantees the restored node is revealed.
- Reuses existing, tested helpers — minimal new surface, no change to the extracted UI-state hook.

**Alternatives considered**:
- **Restore-only one-shot reveal** (mirroring the cursor restore-once) — narrower; would not help other programmatic selectors and adds a special-case flag. Rejected per the chosen design.
- **Lift `expandedState`/`revealSelected` into the layout** so the layout drives the reveal — rejected; the tree owns its expansion state, and the layout only knows `selectedNodeId`. Keeping reveal inside `FileTree` respects that ownership.
