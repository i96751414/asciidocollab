# Implementation Plan: Document Outline View in Editor Left Panel

**Branch**: `028-document-outline-panel` | **Date**: 2026-06-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/028-document-outline-panel/spec.md`

## Summary

Restructure the editor's left panel into a slim activity **rail** + a content **column** that shows one of two views — **Files** (the existing project file tree, unchanged) or **Outline** (the open document's heading hierarchy). The Outline reuses the codebase's existing Lezer-based section outline (`outlineField` / `useSectionOutline`, already computed for the editor) and the existing right-hand `EditorSectionOutline` list renderer, **relocated** into the left panel; the standalone right-hand `EditorOutlinePanel` sidebar is removed (single outline location). Clicking a heading reuses the editor's existing reveal/scroll-sync seam; the current section is derived from the existing cursor-line signal. The active view persists per-user in `localStorage` via the existing `useEditorPreferences` store (client-only — excluded from the account-sync payload). Additive, token-themed, no sanitization change, no editor/preview remount.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, Next.js 16 (App Router), under `apps/web`

**Primary Dependencies**: CodeMirror 6 (editor + existing `outlineField`), Tailwind v4 (`darkMode: 'class'`), shadcn/ui (Button), lucide-react (icons). No new runtime dependency.

**Storage**: Browser `localStorage` only, via the existing `useEditorPreferences` store (key `asciidocollab:editor-preferences`). No database or server schema change.

**Testing**: Jest + React Testing Library (jsdom project) for hooks/components; Playwright e2e for the panel-switch + outline-navigation journeys.

**Target Platform**: Modern evergreen browsers (same as the editor).

**Project Type**: Web frontend (single app, `apps/web`); no backend work.

**Performance Goals**: Outline recompute is debounced/memoized in step with the existing editor updates; no perceptible reflow on view switch. (No performance/benchmark tests — opt-in per Constitution II; spec does not request them.)

**Constraints**: Additive only; MUST NOT touch sanitization; MUST reuse — not duplicate — scroll-sync; the editor and preview components MUST NOT remount when switching views (both views stay mounted, toggled via `hidden`).

**Scale/Scope**: Single open document; documents up to thousands of lines / hundreds of headings remain scannable (panel scrolls).

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v2.3.0. Re-checked after Phase 1 design — still passing.*

| Principle | Status | Notes |
|---|---|---|
| I. Clean Code | ✅ | Small components (`LeftPanel`, `OutlineView`, rail), one responsibility each; intent-revealing names; tokens not literals. |
| II. TDD (NON-NEGOTIABLE) | ✅ | Red-green for: the `leftPanelTab` preference field, the current-section selector (cursor line → nearest preceding heading), the rail tablist (roving focus/`aria-selected`), `OutlineView` (nesting, active row, empty states), and the level-0 outline extension. Plus e2e for switch + navigate. No performance tests (opt-in; spec does not request). |
| III. Seam testing | ✅ (N/A backend) | No repository interfaces involved; client-only. |
| IV. Reuse Before Rebuild | ✅ | Reuses `outlineField`/`useSectionOutline`, `EditorSectionOutline`, `useEditorPreferences`, and the existing reveal/scroll-sync nav seam. The only authored extension is including the level-0 document title in `asciidoc-outline.ts` — a first-party in-repo asset with no vendorable equivalent (documented in research.md §1). |
| V. Theming via tokens | ✅ | Rail/header/active states use `--primary`, `--muted-foreground`, `--accent`, `--border`, `--popover`; verified in light + dark. |
| VI. Style isolation | ✅ N/A | No document-render (preview) stylesheet is touched; only app chrome. |
| VII. Per-user prefs, shared-content immutability | ✅ | `leftPanelTab` is a personal preference in `localStorage`; it never mutates shared document source and never changes another user's view. |
| VIII. Editor Pipeline Integrity | ⚠️→✅ | **Touches the scroll-sync/outline seam** (lifts outline + cursor-line out of the editor; routes heading clicks through the existing reveal/scroll-sync). Per VIII, the seam change is covered by regression tests proving scroll-sync and current-section behavior are unchanged. **Sanitization is not touched.** |
| IX. Untrusted Input Boundary (NON-NEGOTIABLE) | ✅ N/A | No new externally-sourced content; heading text is existing in-document text rendered as React children (auto-escaped). No new path/include resolution, no sanitizer change. |

**Architecture constitution**: change is confined to the `web` layer (`apps/web`); no new cross-layer imports; `fresh-onion` unaffected. No `shared`/`domain`/`api` changes.

**Gate result: PASS** (VIII flagged and satisfied by regression tests; no unjustified violations → Complexity Tracking empty).

## Project Structure

### Documentation (this feature)

```text
specs/028-document-outline-panel/
├── plan.md              # This file
├── research.md          # Phase 0 — heading source + scroll-sync/line API + persistence resolution
├── data-model.md        # Phase 1 — Heading shape + leftPanelTab preference
├── quickstart.md        # Phase 1 — switch views, navigate, current-section behavior
├── spec.md              # Feature spec (+ Clarifications)
└── checklists/requirements.md
```

(No `contracts/` directory: the feature introduces no external interface — it is internal UI reusing existing in-app seams.)

### Source Code (`apps/web`, paths relative to it)

```text
src/
├── app/(dashboard)/dashboard/projects/[id]/
│   └── project-editor-layout.tsx        # MODIFY: render <LeftPanel> in place of the bare file-tree panel;
│                                         #         lift outline entries + cursor line from <AsciiDocEditor>;
│                                         #         feed heading clicks into existing handleLineClick/reveal
├── components/editor/
│   ├── left-panel.tsx                    # NEW: rail + content-column shell; both views mounted, toggled `hidden`
│   ├── left-panel-rail.tsx               # NEW: vertical tablist (Files/Outline icon buttons, roving focus)
│   ├── outline-view.tsx                  # NEW: header ("OUTLINE") + EditorSectionOutline + empty states + current row
│   ├── editor-section-outline.tsx        # REUSE (extend): active-row marker via aria-current + accent; level-0 indent
│   ├── editor-outline-panel.tsx          # REMOVE: right-hand sidebar (relocated into the left panel)
│   └── asciidoc-editor.tsx               # MODIFY: drop right EditorOutlinePanel; surface onOutlineChange + cursor line up
├── hooks/
│   ├── use-editor-preferences.ts         # MODIFY: add leftPanelTab ('files'|'outline'); EXCLUDE from server payload
│   └── use-section-outline.ts            # REUSE: outline entries source (Lezer outlineField)
└── lib/codemirror/
    └── asciidoc-outline.ts               # MODIFY: include the level-0 document title in SectionOutlineEntry[]

tests/                                     # mirror under tests/ (jsdom) + e2e/ (Playwright)
├── hooks/use-editor-preferences.test.*   # leftPanelTab default + persistence + not-synced
├── components/editor/left-panel*.test.tsx
├── components/editor/outline-view.test.tsx
├── lib/codemirror/asciidoc-outline.test.ts  # level-0 inclusion
└── e2e/editor-left-panel-outline.spec.ts    # switch views + navigate + current-section
```

**Structure Decision**: Single web app (`apps/web`). The left-panel shell and Outline view are new components under `src/components/editor/`; everything else extends existing files. The outline data source and navigation seam are reused, not rebuilt.

## Complexity Tracking

> No Constitution violations requiring justification — table intentionally empty.

## Phase 0 — Research

See [research.md](./research.md). Resolves: where headings come from (existing `outlineField` vs. the preview worker; level-0 inclusion), the exact reveal/scroll-sync/cursor-line API reused for navigation and current-section detection, the persistence resolution (`localStorage`-only within the shared store), and the relocation of the existing right-hand outline.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — the `SectionOutlineEntry` (`Heading`) shape (with level-0), the derived current-section selection, and the `leftPanelTab` preference (default, storage, sync exclusion).
- [quickstart.md](./quickstart.md) — switching views from the rail, outline navigation, and current-section highlighting.
- Agent context: `AGENTS.md` SPECKIT marker updated to point at this plan.

**Phase 2 (tasks.md)** is produced by `/speckit-tasks`, not here.
