# Implementation Plan: Project Page Editor

**Branch**: `012-project-page-editor` | **Date**: 2026-06-03 | **Spec**: specs/012-project-page-editor/spec.md

## Summary

Build the project page editor UI — a three-panel layout with a collapsible file tree on the left, a read-only content viewer in the center, and a collapsible AsciiDoc preview panel on the right. All backend APIs are pre-existing; this feature wires together existing file-tree components, API clients, and a new Asciidoctor.js renderer. Adds Playwright E2E tests covering all file management operations (create, rename, delete) and permission enforcement for viewers.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, Next.js 16 (App Router)

**Primary Dependencies**:
- `asciidoctor` (npm) — client-side AsciiDoc → HTML rendering, dynamically imported in `useEffect` to avoid SSR issues
- `@asciidocollab/shared` — existing DTOs
- shadcn/ui + Radix UI + Tailwind CSS — existing component primitives (Dialog, DropdownMenu, Button)
- Jest + Testing Library — unit/integration tests
- Playwright — E2E tests

**Storage**: PostgreSQL via Prisma ORM (existing; no schema changes for this feature)

**Testing**: Jest + Testing Library (unit), Playwright (E2E at `apps/web/e2e/`)

**Target Platform**: Browser — Next.js 16 App Router with client components for interactive UI

**Performance Goals**:
- File tree visible within 2s on standard connection (SC-001)
- File content displays within 1s for files ≤1 MB (SC-002)
- AsciiDoc preview renders a 500-line doc within 2s of panel open (SC-003)
- File management operations reflected in tree within 1s (SC-004)

**Constraints**:
- AsciiDoc rendering is client-side only — no server-side rendering of AsciiDoc
- Content view is read-only; collaborative editor is a future feature
- Mobile layout is out of scope; desktop/wide-viewport only
- File upload via drag-and-drop is out of scope (file _creation_ means new empty file)

**Scale/Scope**: Single-page feature in the existing `apps/web` package; no new monorepo packages (pnpm workspace entries), no database migrations. One new npm dependency (`asciidoctor`) is added to `apps/web`.

## Constitution Check

### I. Clean Code

- All new component names are intent-revealing nouns: `FileContentPanel`, `AsciiDocPreview`, `ProjectEditorLayout`, `RenameDialog`, `DeleteConfirmationDialog`
- State is explicit and isolated: `useFileSelection` hook owns selected-file + content fetching; `sessionStorage` owns preview-panel persistence (scoped to session per FR-006)
- No `window.prompt()` — replaced with proper Radix UI Dialog components (testable by Playwright)
- Error states are typed value objects or explicit string messages; no silent failures
- File extension constants live adjacent to the detection logic

**Status**: COMPLIANT

### II. Test-Driven Development (NON-NEGOTIABLE)

- All new React components get a failing Jest + Testing Library test _before_ production code is written
- The `useFileSelection` hook gets a unit test with mocked `fetch` _before_ implementation
- E2E spec (`project-file-management.spec.ts`) is written _before_ wiring the UI actions
- Commit only after green phase; no commit with failing tests

**Status**: COMPLIANT — TDD cycle applies to every new file

### III. Seam Testing with In-Memory Fakes

- No new domain use cases are introduced in this feature (all backend work is pre-existing)
- Frontend API calls are IO boundaries: mocked via `jest.fn()` / `fetch` mocking in tests — this is the approved use of mocks per the constitution
- No domain repository interfaces are touched; the in-memory fake rule does not apply here

**Status**: COMPLIANT — mock use is limited to the HTTP boundary, not domain interfaces

## Project Structure

### Documentation (this feature)

```text
specs/012-project-page-editor/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── component-props.md
│   └── hook-interfaces.md
└── tasks.md             # Phase 2 output (/speckit-tasks command — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/web/
├── src/
│   ├── app/(dashboard)/dashboard/projects/[id]/
│   │   ├── page.tsx                              # Existing SSR server component — delegates to layout
│   │   └── project-editor-layout.tsx             # NEW client component: split-pane layout
│   ├── components/
│   │   ├── file-tree/                            # Existing — extended
│   │   │   ├── file-tree.tsx                     # Extended: accept + call onSelectFile callback
│   │   │   ├── file-tree-actions.tsx             # Extended: replace prompt() with Dialog components
│   │   │   └── file-tree-node.tsx                # Extended: accept + propagate isOwner prop
│   │   ├── file-content-panel.tsx                # NEW: read-only content display
│   │   └── asciidoc-preview.tsx                  # NEW: collapsible Asciidoctor.js renderer
│   └── hooks/
│       └── use-file-selection.ts                 # NEW: selected-file state + content fetching
├── tests/
│   ├── components/
│   │   ├── file-content-panel.test.tsx           # NEW
│   │   └── asciidoc-preview.test.tsx             # NEW
│   └── hooks/
│       └── use-file-selection.test.ts            # NEW
└── e2e/
    └── project-file-management.spec.ts           # NEW: file CRUD + viewer permissions E2E
```

**Structure Decision**: Pure frontend feature within `apps/web`. All new files follow the existing `src/` → `tests/` mirror structure. No `__tests__/` directories, no co-located test files.

## Complexity Tracking

> No Constitution violations to justify.
