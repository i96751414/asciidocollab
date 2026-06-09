# Implementation Plan: Persist & Restore File Selection

**Branch**: `019-persist-file-selection` | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-persist-file-selection/spec.md`

## Summary

When a user leaves a project view (e.g. to Settings) and later returns, the editor should re-select the file they last had open, **reveal it in the file tree (expand collapsed ancestor folders + scroll into view)**, and — for AsciiDoc files — return the cursor to the line they were on (clamped to the closest valid line if the document changed). The implementation is **frontend-only**: per-user, per-project "last selection" state (file identity + optional cursor line) is persisted to `localStorage` and restored when `ProjectEditorLayout` mounts. No API, domain, or database changes are required. This mirrors the existing client-side persistence patterns already in the codebase (editor drafts in `localStorage`, preview-open state in `sessionStorage`). The tree-reveal reuses the existing `revealSelected` helper in `useFileTreeUIState`; `FileTree` is extended to auto-reveal whenever its `selectedNodeId` changes to a node that isn't currently visible.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), React 19 / Next.js 16 (App Router)

**Primary Dependencies**: CodeMirror 6 (`@codemirror/state`, `@codemirror/view`) for cursor positioning; existing `useFileSelection` / `useEditorMount` hooks; no new runtime dependencies

**Storage**: Browser `localStorage` (client-only). Key namespace `asciidocollab:last-selection:<userId>:<projectId>` (user-scoped so accounts sharing a browser profile stay isolated). No PostgreSQL/Prisma involvement.

**Testing**: Jest + Testing Library (unit) for hooks/components; Playwright (E2E) for the navigate-away-and-return journey

**Target Platform**: Modern browsers (same runtime as the existing web app)

**Project Type**: Web application — change is isolated to `apps/web`

**Performance Goals**: Restoration completes within 1s of the project view becoming visible (SC-003); reads/writes are synchronous `localStorage` operations (sub-millisecond) and must not block first paint

**Constraints**: No new backend surface; must degrade gracefully when `localStorage` is unavailable or throws (private mode/quota); restoration must never block the view or surface an error (FR-009, FR-010)

**Scale/Scope**: One persisted record per (browser, user-session, project); a handful of new/changed frontend files; ~3 user stories

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Governance Constitution (v2.0.0)**

- **I. Clean Code** — PASS. New logic is a small, single-purpose hook (`useLastSelection`) with named storage-key constants (no magic strings) and an explicit, isolated side effect (`localStorage`). Parsing untrusted stored JSON has an explicit guard + fallback path.
- **II. TDD (NON-NEGOTIABLE)** — PASS (by process). Every new unit (the hook's read/write/clear, the line-clamp helper, the editor `initialLine` behavior) gets a failing Jest test first; the navigate-and-return journey gets a Playwright spec. No production code before a red test.
- **III. Seam Testing with In-Memory Fakes** — N/A. This principle governs **domain repository interfaces**; this feature introduces none. The only IO boundary is `localStorage`, which is exercised directly in jsdom (Testing Library) — the constitution explicitly permits real/IO doubles where domain fakes don't apply.

**Architecture Constitution (v2.4.0)**

- **Layer boundaries / business-logic placement** — PASS. No business rule crosses a layer; this is presentation/UI state local to `apps/web`. No domain port, no infrastructure adapter, no cross-package type.
- **Data access (Prisma only) / Database migration policy** — N/A / PASS. No database access and no schema change, so the "ask before migrating" rule is not triggered.
- **Technology mandates** — PASS. Uses CodeMirror 6 for cursor placement, React hooks, Next.js client component — all mandated tools.
- **Test file layout** — PASS. New tests live under `apps/web/tests/...` mirroring `src/`; no `__tests__/`, no co-location.
- **Blocking violations (P0)** — none. No `any`, no `as` casts in production code (stored-JSON parsing uses type-guard narrowing, following the existing `use-editor-preferences.ts` pattern); no test co-location; no Prisma migration.

**Security Constitution (v1.0.0)**

- PASS. No new external input reaches the domain. Stored data is non-sensitive UI state (a node id + line number) — no secrets, no PII. No new endpoints, so rate-limiting/CORS are unaffected. Stale/forged `localStorage` values are validated on read and cannot escalate access: the file content fetch still goes through the existing authenticated, project-scoped API, which enforces authorization; an invalid/forbidden node id simply yields the graceful fallback. **User isolation (FR-011):** the storage key is scoped by `userId` (`asciidocollab:last-selection:<userId>:<projectId>`), so two accounts sharing one browser profile never read each other's selection. The `userId` is resolved server-side via `getProjectAccess` (`currentUserId`, from `/auth/me`) and passed into the layout as a prop — no extra client fetch.

**Result**: All gates pass. No entries required in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/019-persist-file-selection/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (UI/state contracts)
│   ├── last-selection-storage.md
│   └── editor-restore-position.md
├── spec.md              # /speckit-specify output
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

All changes are confined to `apps/web`:

```text
apps/web/src/
├── hooks/
│   ├── use-last-selection.ts          # NEW — read/write/clear per-project last selection in localStorage
│   ├── use-file-selection.ts          # EDIT — surface a "not found" (404) signal so stale memory can be cleared
│   └── use-editor-mount.ts            # EDIT — accept optional initialLine; position cursor + scrollIntoView on mount (clamped)
├── components/
│   ├── editor/
│   │   └── asciidoc-editor.tsx        # EDIT — thread initialLine through; report cursor line up via onCursorLineChange
│   └── file-tree/
│       └── file-tree.tsx              # EDIT — auto-reveal: when selectedNodeId changes to a hidden node, call existing revealSelected + scrollIntoView (FR-012); reuses useFileTreeUIState.revealSelected (no change to that hook)
└── app/(dashboard)/dashboard/projects/[id]/
    ├── page.tsx                       # EDIT — pass currentUserId (from getProjectAccess) into the layout
    └── project-editor-layout.tsx      # EDIT — accept userId prop; on mount restore last selection; persist file on select + cursor line on change

apps/web/tests/
├── hooks/
│   └── use-last-selection.test.ts     # NEW
├── components/
│   ├── editor/
│   │   └── asciidoc-editor.test.tsx   # EDIT — initialLine restore + clamp + cursor-line reporting cases
│   └── file-tree/
│       └── file-tree.test.tsx         # EDIT — mounting with a deep selectedNodeId expands ancestors + scrolls into view; manual collapse of selected node does not re-expand (FR-012)
└── (layout integration covered by component test + E2E)

apps/web/e2e/
└── project-file-restore.spec.ts       # NEW — navigate to settings and back; file + line restored; nested-collapsed-folder reveal (US3 deleted-file fallback is covered by unit/layout tests, not E2E)
```

**Structure Decision**: Web application; the feature is a self-contained slice of `apps/web` presentation state. The new `useLastSelection` hook follows the established `use-editor-preferences.ts` / `use-file-selection.ts` conventions (typed result object, guarded `localStorage` access, named LS key constant). No other package is touched.

## Complexity Tracking

> No constitution violations — section intentionally empty.
