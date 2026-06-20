---
description: "Task list for feature 029 — Optional Display of Included AsciiDoc Files in Preview"
---

# Tasks: Optional Display of Included AsciiDoc Files in Preview

**Input**: Design documents from `/specs/029-show-includes-option/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: REQUIRED. Constitution II (Test-Driven Development) is NON-NEGOTIABLE — every behavioral task is preceded by a failing (red) test. (No performance/load tests — Constitution II opt-in; the spec does not request them.)

**Scope note**: The preference is **browser-local / client-only** (localStorage, like `leftPanelTab`). There is **NO** server, DB, domain, repository, or API change — all work is in `apps/web`.

**Organization**: Tasks are grouped by user story (US1 P1 → US2 P2 → US3 P3) for independent implementation and testing.

## Note on the render worker & Opal

`asciidoc-render.worker.ts` imports Asciidoctor (Opal), which CANNOT run under ts-jest (project memory `stem_preview_and_jest_opal`). The behavioral core is therefore tested via the **pure** `assemble-includes.ts` (no Opal) and the **hook/component** layers (jsdom, mocked worker). End-to-end render correctness is confirmed by the real-browser quickstart pass (T026).

## Path Conventions

Web tests live under `apps/web/tests/...` mirroring `apps/web/src/...` (drop `src/`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Type plumbing and the shared placeholder builder used by the assembler, the preview, and the CSS.

- [ ] T001 [P] Add `showIncludes?: boolean` to the `RenderRequest` interface in `apps/web/src/workers/asciidoc-render.worker.ts` (type only; no behavior yet)
- [ ] T002 [P] Add `showIncludes?: boolean` to the `RenderRequest` interface in `apps/web/src/hooks/use-asciidoc-preview.ts` (type only; no behavior yet)
- [x] T003 [P] Write failing unit test for the shared placeholder builder in `apps/web/tests/lib/asciidoc/include-placeholder.test.ts` (HTML-escapes `& < > " '` in the target; emits the `++++` passthrough wrapping `<div class="adoc-include-placeholder" data-include-target="…" role="button" tabindex="0">included: …</div>`; exports the class/attr name constants)
- [x] T004 Implement the shared placeholder module in `apps/web/src/lib/asciidoc/include-placeholder.ts` (`INCLUDE_PLACEHOLDER_CLASS`, `INCLUDE_PLACEHOLDER_TARGET_ATTR`, `escapeHtml`, `buildIncludePlaceholderBlock(target)`) to pass T003

**Checkpoint**: Shared types + placeholder builder available to all later phases.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Make `showIncludedFiles` exist as a **client-only** per-browser preference defaulting to **false**, available to the preview. Implemented as a localStorage value stripped from the account PUT (so it never reaches the server and cannot 400 it), mirroring `leftPanelTab`.

- [x] T005 [P] Write failing test in `apps/web/tests/hooks/use-editor-preferences.test.ts`: `useEditorPreferences` exposes `showIncludedFiles` (default `false`) + `setShowIncludedFiles`; the setter writes localStorage; `showIncludedFiles` is treated as client-only — it is NOT included in the account PUT payload and the server GET fetch-merge keeps the local value; existing setters (e.g. `setFontSize`) still PUT successfully
- [x] T006 Add `showIncludedFiles` (default `false`) to `EditorPrefs`, `DEFAULT_PREFS`, `loadFromStorage`, the result object, and a `setShowIncludedFiles` setter (localStorage write, no `schedulePut`/server write), AND add the key to `CLIENT_ONLY_KEYS` + keep it in the fetch-merge (mirror `leftPanelTab`) in `apps/web/src/hooks/use-editor-preferences.ts`. Passes T005

**Checkpoint**: `showIncludedFiles` defaults to false, persists in localStorage, never touches the server; the preview can read it. US1/US2 can now begin.

---

## Phase 3: User Story 1 — Edit a file without included content cluttering the preview (Priority: P1) 🎯 MVP

**Goal**: With the option at its default (off), the preview of ANY file with includes hides each included body behind a clickable placeholder while still resolving variables/attributes the includes define for subsequent content. Reads the most current content of each file.

**Independent Test**: Open a file that includes a child defining `:product-name: Acme` and references `{product-name}` after the include — the child body is hidden, a placeholder shows, the paragraph renders "Acme", and clicking the placeholder opens the child. (SC-001, SC-006, SC-007, FR-003/FR-003a/FR-003b/FR-004/FR-004a/FR-004b/FR-014/FR-015)

### Tests for User Story 1 (write first, ensure they FAIL) ⚠️

- [x] T007 [P] [US1] Failing assembler hide-mode tests in `apps/web/tests/workers/assemble-includes.hide.test.ts`: with `showIncludes:false` the included body is suppressed but a `{name}` defined in the include still resolves after the include location; exactly one placeholder per top-level include and NONE for nested includes; an unresolvable include yields a placeholder with the raw target AND is recorded in `unresolved[]`; a **non-AsciiDoc include** (e.g. a `source`/code-snippet `include::snippet.rb[]`) is ALSO suppressed behind a placeholder (FR-012 — content suppression applies to all include types); an `image::` line located INSIDE a hidden include is among the dropped body lines (FR-011 — images inside a hidden include are suppressed with that include's body)
- [x] T008 [P] [US1] Failing assembler attribute-fidelity tests in `apps/web/tests/workers/assemble-includes.attributes.test.ts`: `:leveloffset:` + `:table-caption:` (and `sectnums`/`idprefix`/`xrefstyle`) defined in a NESTED/transitive include still take effect on later content with `showIncludes:false` (SC-006); a conditionally-gated (`ifdef` false) include contributes no attributes in either mode; a downstream `ifdef::flag[]` region whose `:flag:` is **set by a hidden include** still evaluates as active (i.e. as if the include were processed) with `showIncludes:false` (FR-005 / US1 acceptance scenario 3 — positive case, distinct from the gated-include inverse above); a **partial include** (`include::child.adoc[tags=foo]` or `lines=`) contributes ONLY the attributes defined in the selected portion in hide mode, identical to show mode (spec edge case — partial includes); an inline `{set:}` on suppressed prose emits a synthetic attribute entry so its effect survives
- [x] T009 [P] [US1] Failing regression/equivalence test in `apps/web/tests/workers/assemble-includes.showmode.test.ts`: with `showIncludes:true` (and default) the assembled output is byte-identical to the pre-feature output for representative inputs; an include-FREE document assembles to itself byte-for-byte (scroll-sync no-regression, FR-014)
- [x] T010 [P] [US1] Failing hook test in `apps/web/tests/hooks/use-asciidoc-preview.test.ts`: the posted `RenderRequest` assembles rooted at the OPEN file for a non-main file (assembly not gated on open==main), carries `showIncludes` from the preference, and the open file's live `content` is used for the root (overlay), while other files come from the `files` snapshot
- [x] T011 [P] [US1] Failing preview component test in `apps/web/tests/components/asciidoc-preview.placeholder.test.tsx`: a rendered `.adoc-include-placeholder[data-include-target]` invokes `onOpenInclude` with the target on click and on Enter/Space; the element survives `DOMPurify.sanitize(..., { USE_PROFILES: { html: true } })` retaining `class`/`data-include-target`/`role`/`tabindex` (Constitution VIII guard)

### Implementation for User Story 1

- [x] T012 [US1] Implement assembler hide mode in `apps/web/src/workers/assemble-includes.ts`: add `showIncludes?: boolean` option (default `true`); thread an `emit` flag through `expand()`; in `emit:false` keep all attribute/leveloffset/conditional/guard bookkeeping but emit ONLY attribute-set/unset/leveloffset lines (+ synthetic entries for inline `{set:}` on dropped prose) and recurse into active nested includes with `emit:false` (no nested placeholder); when `showIncludes:false`, replace each active top-level include with `buildIncludePlaceholderBlock(resolvedOrRawTarget)` + the attribute-only child + existing absolute `:leveloffset:` set/restore. Passes T007, T008, T009
- [x] T013 [US1] Thread the option + generalized root in `apps/web/src/workers/asciidoc-render.worker.ts`: read `showIncludes` from the request; assemble rooted at the open file whenever `files` is present (build a `readFile` that returns the live `content` for the open path, else `files[p] ?? null`); pass `{ showIncludes, seedAttributes }`; keep `seedAttributesFromScope` (inherited scope) applying independently
- [x] T014 [US1] Generalize assembly in `apps/web/src/hooks/use-asciidoc-preview.ts`: assemble rooted at `openFileId` for ANY file (remove the open==main gate), always send `files` + `openFileId` when available, include `showIncludes` (read at render time via ref); keep sending `rootFileId` for inherited scope. Passes T010
- [x] T015 [US1] Add `showIncludedFiles?: boolean` and `onOpenInclude?: (path: string) => void` props to `apps/web/src/components/asciidoc-preview.tsx`; pass `showIncludes={showIncludedFiles}` into `useAsciidocPreview`; attach ONE delegated `click` + `keydown`(Enter/Space) listener on the output container that, for a `.adoc-include-placeholder[data-include-target]`, calls `onOpenInclude(target)`. Passes T011
- [x] T016 [P] [US1] Add the scoped placeholder rule under `.asciidoc-preview-content` in `apps/web/src/styles/asciidoc-preview.css` (subtle/muted, `cursor: pointer`, visible `:focus-visible` ring; MUST NOT affect app chrome — Constitution VI)
- [x] T017 [US1] Wire the layout in `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx`: read `showIncludedFiles` from `useEditorPreferences()`; pass `showIncludedFiles` and `onOpenInclude={handleNavigateToFile}` to `<AsciiDocPreview>`; ensure `getFiles` + open-file path are passed for any open file (not only main)

**Checkpoint**: Opening any include-bearing file (main or not) hides bodies by default, shows clickable placeholders, resolves include-defined variables/attributes after the include, and reads the most current content. MVP complete.

---

## Phase 4: User Story 2 — Opt in to see the fully assembled document (Priority: P2)

**Goal**: A header toggle lets the user turn the option ON to inline included bodies (current behavior), and OFF again, live without reload.

**Independent Test**: With an include-bearing file open, toggle the header control ON → bodies inline; toggle OFF → bodies hide again, no reload. (US2, FR-006, FR-007, FR-008, SC-003)

### Tests for User Story 2 (write first, ensure they FAIL) ⚠️

- [x] T018 [P] [US2] Failing control test in `apps/web/tests/components/show-includes-control.test.tsx`: renders a toggle reflecting `value` via `aria-pressed`; activating it calls `onChange` with the flipped value; has a stable `data-testid`
- [x] T019 [P] [US2] Failing live-re-render test in `apps/web/tests/hooks/use-asciidoc-preview.rerender.test.ts`: changing `showIncludes` triggers a new render request (the preview updates without a content edit or reload)

### Implementation for User Story 2

- [x] T020 [US2] Implement `apps/web/src/components/show-includes-control.tsx` (header toggle following `preview-style-control.tsx` conventions: design tokens, `aria-pressed`, `data-testid`). Passes T018
- [x] T021 [US2] Render `ShowIncludesControl` in the preview header in `apps/web/src/components/asciidoc-preview.tsx`, bound to `showIncludedFiles` + a new `onShowIncludedFilesChange` prop (rendered only when the change handler is provided, mirroring the preview-style control)
- [x] T022 [US2] Add `showIncludes` to the live-re-render effect dependencies in `apps/web/src/hooks/use-asciidoc-preview.ts` (extend the existing `[mainPath, rootFileId]` effect). Passes T019
- [x] T023 [US2] Pass `onShowIncludedFilesChange={setShowIncludedFiles}` from `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx` to `<AsciiDocPreview>`

**Checkpoint**: User can flip included content on/off live from the preview header.

---

## Phase 5: User Story 3 — Preference is remembered across sessions (same browser) (Priority: P3)

**Goal**: The choice is retained on reload in the same browser (browser-local; not synced across devices). The persistence implementation lives in Foundational (T006); this phase validates the story and confirms the client-only guarantee.

**Independent Test**: Toggle the option, reload the application in the same browser → state retained; a different browser starts at the default. (US3, FR-009, SC-004)

### Tests for User Story 3 (write first, ensure they FAIL) ⚠️

- [x] T024 [P] [US3] Failing persistence test in `apps/web/tests/hooks/use-editor-preferences.persistence.test.ts`: setting `showIncludedFiles` true, then re-initializing the hook from the persisted localStorage, yields `true`; assert no account PUT ever carried `showIncludedFiles` (client-only); a fresh storage (no key) yields the default `false`

### Implementation for User Story 3

- [x] T025 [US3] Confirm/finish the client-only persistence wiring in `apps/web/src/hooks/use-editor-preferences.ts` (key present in `CLIENT_ONLY_KEYS`, fetch-merge keeps the local value, `loadFromStorage` round-trips the boolean). Passes T024. (If fully satisfied by T006, this task is a verification + any gap-fill only.)

**Checkpoint**: The option persists across reloads in the same browser and is never synced to the account.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T026 Run the `quickstart.md` manual verification in a REAL browser (Opal can't run under jest): SC-001..SC-008 — hidden-by-default + placeholder, click-to-open, toggle live, non-main file (FR-014), images always show (FR-011), no-includes no-op + exact scroll-sync (SC-005), live collaborative included content (FR-015/SC-008), and same-browser reload persistence (SC-004)
- [x] T027 [P] Confirm style isolation: the placeholder rule lives only under `.asciidoc-preview-content` and produces zero change to app chrome (Constitution VI) — quick visual/inspection check in both light and dark mode
- [x] T028 [P] Run quality gates for `apps/web` — `pnpm lint` (zero warnings) and `pnpm typecheck` (zero errors); ensure all unit/component suites green
- [x] T029 [P] Update project memory (`feature 029` status) noting the assembler hide-mode + generalized open-file assembly root + content-currency reuse + client-only preference, for future features

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. BLOCKS user stories (provides default-false `showIncludedFiles`).
- **US1 (Phase 3)**: depends on Foundational. MVP.
- **US2 (Phase 4)**: depends on Foundational + US1 (toggles the behavior US1 implements).
- **US3 (Phase 5)**: depends on Foundational (its implementation is T006); this phase is its validation. Independent of US1/US2.
- **Polish (Phase 6)**: after the desired stories are complete.

### Within Each Story

- Write the failing test(s) first; confirm red; implement to green; commit only on green (Constitution II).
- US1: assembler core (T012) → worker/hook threading (T013, T014) → preview component/CSS (T015, T016) → layout wiring (T017).

### Parallel Opportunities

- Setup: T001, T002, T003 in parallel (T004 after T003).
- US1 tests T007–T011 in parallel (different files) before their implementations.
- US3 (T024) can be validated independently and in parallel with US1/US2.

---

## Parallel Example: User Story 1 tests

```bash
# Launch all US1 failing tests together (different files):
Task: "Assembler hide-mode tests in apps/web/tests/workers/assemble-includes.hide.test.ts"
Task: "Assembler attribute-fidelity tests in apps/web/tests/workers/assemble-includes.attributes.test.ts"
Task: "Show-mode equivalence/regression tests in apps/web/tests/workers/assemble-includes.showmode.test.ts"
Task: "Preview hook generalized-root test in apps/web/tests/hooks/use-asciidoc-preview.test.ts"
Task: "Preview placeholder click/sanitize test in apps/web/tests/components/asciidoc-preview.placeholder.test.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & validate** the US1 independent test (hidden-by-default + placeholder + attributes + click, on any include-bearing file). Shippable MVP.

### Incremental Delivery

1. Setup + Foundational → foundation ready (preference exists, default off, persisted locally).
2. US1 → hidden-by-default behavior (MVP).
3. US2 → header toggle to show/hide live.
4. US3 → confirm same-browser persistence.

Each story is independently testable and adds value without breaking earlier ones.

---

## Notes

- [P] = different files, no dependency on an incomplete task.
- Every behavioral change is preceded by a failing test (Constitution II, non-negotiable). No performance tests (not requested). No server-side tests (no server change).
- Constitution call-outs while implementing: VI (placeholder CSS scoped to preview surface), VII (preference per-user/per-browser client-only, never mutates shared content), VIII (assembled output passes UNCHANGED through the existing DOMPurify; scroll-sync exact for include-free files), IX (placeholder target sandbox-resolved + HTML-escaped).
- Commit granularly (one logical change per commit), conventional-commit messages, never commit on red.
