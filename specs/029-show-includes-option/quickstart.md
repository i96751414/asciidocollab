# Quickstart: Optional Display of Included AsciiDoc Files

## What this delivers

A per-user (browser-local) **"show included files"** toggle in the preview header (default **off**). With it off, the preview of any include-bearing file hides included bodies behind a subtle, clickable placeholder — while variables/attributes defined in those includes still resolve for content after the include. With it on, includes inline as before.

## Implementation order (TDD, bottom-up)

Each step is **red first** (write the failing test), then green, then refactor. Commit only on green.

1. **Assembler hide mode** (`apps/web/src/workers/assemble-includes.ts`) — the behavioral core.
   - Red: unit tests for the invariants in `contracts/render-worker-interface.md` (attribute fidelity, placeholder count, nested/transitive, conditional gating, leveloffset/captions, unresolved target, show-mode regression).
   - Green: add `showIncludes` option + `emit` recursion + placeholder emitter (sandbox-resolved, HTML-escaped target).
2. **Worker + hook threading & generalized root** (`asciidoc-render.worker.ts`, `use-asciidoc-preview.ts`, `project-editor-layout.tsx`): add `showIncludes` to `RenderRequest`; assemble rooted at the OPEN file for ANY file with includes (generalize the main-file-only gate, FR-014); `readFile` overlays the live `content` for the open path (FR-015); inherited-scope seeding (027) coexists; re-render on toggle change.
3. **Client-only preference** (`use-editor-preferences.ts`): add `showIncludedFiles` (default false) to localStorage load/merge/setter and to `CLIENT_ONLY_KEYS` (stripped from the account PUT, kept on fetch-merge), mirroring `leftPanelTab`. No server/DB/domain/API change.
4. **UI**: `show-includes-control.tsx` (header toggle) + `asciidoc-preview.tsx` props (`showIncludedFiles`, `onOpenInclude`), delegated click/keyboard handler, scoped placeholder CSS.
5. **Wire-up** (`project-editor-layout.tsx`): read `showIncludedFiles`; pass to `<AsciiDocPreview>`; `onOpenInclude={handleNavigateToFile}`.

## Manual verification (real browser — Opal/Asciidoctor cannot run under ts-jest)

Use a project with a child defining attributes that is included by another file. Verify with the **main file** open AND, separately, with a **non-main file that has its own includes** open:

1. **Default (off)**: child body is NOT shown; a placeholder `included: <path>` appears at each include; a `{name}`/caption/`leveloffset` defined in the child still applies to content after the include. (SC-001, SC-006)
2. **Click a placeholder**: the child file opens in the editor. (FR-003b)
3. **Toggle on**: child bodies inline at their locations, no reload. (US2, FR-008)
4. **Toggle off again**: bodies hide again live.
5. **Non-main file (FR-014/SC-007)**: open a non-main file that itself has includes — confirm the SAME behavior (placeholders + attribute loading + click-to-open) applies to its includes.
6. **Reload (same browser)**: the chosen state persists. A different browser/device starts at the default — the preference is browser-local, not synced. (SC-004/FR-009)
7. **Images**: an `image::` in the rendered document always renders regardless of the toggle. (FR-011)
8. **No includes**: toggling has no visible effect; scroll-sync stays exact. (SC-005)
9. **Live collaborative content (FR-015/SC-008)**: with a collaborator editing an included file in an active session, confirm the preview's shown body and resolved variables reflect the unsaved live edits, not the last saved version.

## Quality gates (per Constitution)

- `pnpm lint` (zero warnings in touched packages), `pnpm typecheck` (zero errors), relevant unit/integration tests green.
- Re-confirm Constitution VIII/IX: no DOMPurify config change; placeholder target sandbox-resolved + HTML-escaped.
