---
description: "Task list for Per-User Preview Style Preference"
---

# Tasks: Per-User Preview Style Preference

**Input**: Design documents from `/specs/022-preview-style-preference/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: REQUIRED. Constitution Principle II (TDD, NON-NEGOTIABLE) applies — every production
change is preceded by a failing test (red → green → refactor). In-memory fakes mirror real
repositories (Principle III).

**Organization**: Grouped by user story (US1 P1, US2 P2, US3 P2) for independent delivery.

## Path Conventions

Per the architecture constitution: source under `packages/*/src/` and `apps/*/src/`; tests under
a mirrored `tests/` tree (never co-located, never `__tests__/`). Domain uses grouped subfolders
(`value-objects/`, `constants/`, `entities/`, `use-cases/settings/`, `ports/user/`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Pull in the vendored assets, fonts, and the one new dev dependency.

- [x] T001 Add `postcss-prefix-selector` as a devDependency in `apps/web/package.json` and run `pnpm install`
- [x] T002 [P] Vendor the MIT-licensed Asciidoctor default stylesheet verbatim to `apps/web/src/styles/vendor/asciidoctor-default.css`, preserving the original license/comment header and recording the upstream source + commit/tag in a top comment (obtain order: `@asciidoctor/core` css → `asciidoctor-stylesheets` pkg → `asciidoctor/asciidoctor` repo `data/stylesheets/asciidoctor-default.css`)
- [x] T003 [P] Load Open Sans, Noto Serif, and a monospace (Droid Sans Mono → Ubuntu Mono fallback) via `next/font/google` as CSS variables in `apps/web/src/app/layout.tsx` (alongside the existing Inter/Urbanist setup)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish shared primitives needed by all stories — the `PreviewStyle` value object, the
scoped Asciidoctor stylesheet (build pipeline), and the shared UI control.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 [P] Write failing test for the `PreviewStyle` value object (parse valid tokens `asciidocollab`/`asciidoctor`, reject unknown with `ValidationError`) in `packages/domain/tests/value-objects/preview-style.test.ts`
- [x] T005 [P] Add `DEFAULT_PREVIEW_STYLE = 'asciidocollab'` constant in `packages/domain/src/constants/editor-preferences.ts`
- [x] T006 Implement the `PreviewStyle` value object in `packages/domain/src/value-objects/preview-style.ts` (mirror `editor-theme.ts`: private ctor + `static parse(raw): Result<PreviewStyle, ValidationError>`) and export it from `packages/domain/src/value-objects/index.ts` (makes T004 green)
- [x] T007 Create the scoping build script `apps/web/scripts/build-asciidoctor-style.mjs` using `postcss-prefix-selector`: prefix every selector with `.asciidoc-preview-content[data-preview-style="asciidoctor"]`, map root selectors (`html`, `body`, `:root`, `*`) onto the scope itself, and leave at-rules (`@media`/`@keyframes`/`@font-face`) intact; read `vendor/asciidoctor-default.css`, emit `src/styles/asciidoctor-style.generated.css`
- [x] T008 Add a `build:asciidoctor-style` npm script and wire it into the existing `predev`/`prebuild` chains in `apps/web/package.json`; run it once to generate and commit `apps/web/src/styles/asciidoctor-style.generated.css` (matches the repo's committed-generated-artifact convention) (depends on T002, T007)
- [x] T009 Import the generated stylesheet once in `apps/web/src/components/asciidoc-preview.tsx` (next to the existing `asciidoc-preview.css` import) so the scoped rules are bundled (depends on T008)
- [x] T010 [P] Build the shared `PreviewStyleControl` shadcn component (compact segmented / two-option select; props `value`/`onChange`/optional `compact`; `role="group"`, keyboard-operable, active option marked) in `apps/web/src/components/preview-style-control.tsx`. The component maps the stored lowercase token values to display labels (`asciidocollab` → "Asciidocollab", `asciidoctor` → "Asciidoctor"); labels are display-only and never stored

**Checkpoint**: Asciidoctor styles exist and are scoped; the shared control and domain value object are ready.

---

## Phase 3: User Story 1 - Switch preview style from the preview header (Priority: P1) 🎯 MVP

**Goal**: A writer flips the Style control in the preview header and the rendered preview restyles
instantly in place — no reload, document source untouched. Choice is remembered in-browser.

**Independent Test**: Open a document, switch the header Style control between the two options, confirm
the preview visibly changes each time while the editor source stays untouched; reload the same browser
and confirm the choice is remembered.

### Tests for User Story 1 ⚠️ (write first, must FAIL)

- [x] T011 [P] [US1] Component test: the header Style control flips `data-preview-style` on `.asciidoc-preview-content` and never mutates the rendered source, in `apps/web/tests/components/asciidoc-preview.test.tsx`
- [x] T012 [P] [US1] Hook test: `previewStyle` defaults to the `asciidocollab` token, `setPreviewStyle` persists to localStorage, and an invalid stored value falls back to default (FR-015/FR-016 seed), in `apps/web/tests/hooks/use-editor-preferences.test.ts`

### Implementation for User Story 1

- [x] T013 [US1] Extend `useEditorPreferences` in `apps/web/src/hooks/use-editor-preferences.ts`: add `previewStyle` to `EditorPrefs`/`DEFAULT_PREFS`, add an `isPreviewStyleValue` guard, parse it in `loadFromStorage` with default-on-invalid, add a `setPreviewStyle` setter that writes localStorage, and expose both (API sync added in US2) (makes T012 green)
- [x] T014 [US1] In `apps/web/src/components/asciidoc-preview.tsx`, accept `previewStyle` + `onPreviewStyleChange` props, render `PreviewStyleControl` in the header row beside the sync/collapse buttons, and set `data-preview-style={previewStyle}` on the `.asciidoc-preview-content` element (present on first paint, FR-016) (makes T011 green)
- [x] T015 [US1] Thread `previewStyle`/`setPreviewStyle` from `useEditorPreferences` through `apps/web/src/components/editor/asciidoc-editor.tsx` down to `AsciiDocPreview`

**Checkpoint**: US1 fully functional — header toggle restyles the preview instantly and persists per-browser.

---

## Phase 4: User Story 2 - Preference persists per user across sessions and devices (Priority: P2)

**Goal**: The preview style is a durable per-user preference stored on the account — survives reload,
follows the user across devices, and is editable from settings, kept in sync with the header control.

**Independent Test**: Choose Asciidoctor, reload → still Asciidoctor; sign in on another device as the
same user → Asciidoctor; change it in settings → the header control reflects it and vice versa; a
brand-new user defaults to Asciidocollab.

### Tests for User Story 2 ⚠️ (write first, must FAIL)

- [x] T016 [P] [US2] Entity test: `EditorPreferences` carries `previewStyle` defaulting to the brand style, in `packages/domain/tests/entities/editor-preferences.test.ts`
- [x] T017 [P] [US2] Save use-case test: persists `previewStyle`, coalesces a missing input to existing/default, in `packages/domain/tests/use-cases/settings/save-editor-preferences.test.ts`
- [x] T018 [P] [US2] Prisma repo integration test: `previewStyle` round-trips, and a corrupt/unknown stored value maps to the `asciidocollab` token instead of throwing (FR-015), in `packages/infrastructure/tests/persistence/user/prisma-editor-preferences.repository.test.ts`
- [x] T019 [P] [US2] API route test: GET returns `previewStyle`; PUT accepts a valid value, rejects an out-of-enum value (400), and persists it, in `apps/api/tests/routes/editor-preferences.test.ts`

### Implementation for User Story 2

- [x] T020 [US2] Add optional `previewStyle: 'asciidocollab' | 'asciidoctor'` to `EditorPreferencesDto` in `packages/shared/src/dtos/editor-preferences.dto.ts`
- [x] T021 [US2] Add a trailing optional `previewStyle: PreviewStyle` (default brand) to the `EditorPreferences` entity in `packages/domain/src/entities/editor-preferences.ts` (makes T016 green)
- [x] T022 [US2] Extend `SaveEditorPreferencesUseCase` input + parse/coalesce `previewStyle` (existing → default), verify `GetEditorPreferencesUseCase` returns it, in `packages/domain/src/use-cases/settings/save-editor-preferences.ts` (makes T017 green)
- [x] T023 [US2] Update the in-memory fake to carry `previewStyle` with identical default + fallback semantics in `packages/domain/tests/ports/user/in-memory-editor-preferences.repository.ts` (Principle III parity)
- [x] T024 [US2] Add `previewStyle String @default("asciidocollab")` to `model EditorPreferences` in `packages/db/prisma/schema.prisma` and generate the migration
- [x] T025 [US2] Map `previewStyle` in `save` (update + create) and `toDomain` (parse via `PreviewStyle`, fall back to default rather than throw) in `packages/infrastructure/src/persistence/user/prisma-editor-preferences.repository.ts` (makes T018 green)
- [x] T026 [US2] Extend the PUT body schema (`previewStyle` enum, not required), pass it into the save use-case, and include it in the GET DTO mapping in `apps/api/src/routes/editor-preferences.ts` (makes T019 green)
- [x] T027 [US2] Wire `previewStyle` into the client hook's API sync (include it in the debounced PUT body and merge it from the GET-on-mount response with the default-on-invalid guard) in `apps/web/src/hooks/use-editor-preferences.ts`
- [x] T028 [US2] Add a "Preview Style" row using the shared `PreviewStyleControl` bound to `useEditorPreferences().previewStyle` in `apps/web/src/app/(dashboard)/dashboard/settings/editor-preferences-card.tsx`

**Checkpoint**: US2 complete — preference is durable per-user across devices and editable from both surfaces in sync.

---

## Phase 5: User Story 3 - Each style is legible and correct in the user's color mode (Priority: P2)

**Goal**: Asciidocollab follows app light/dark; Asciidoctor renders on its own fixed light surface and
stays legible in dark mode; Asciidoctor styling never leaks into the app chrome.

**Independent Test**: In app dark mode, view Asciidocollab (dark, legible), switch to Asciidoctor
(light docs-like, legible), and confirm toolbars/panels/menus are visually unchanged in both.

### Tests for User Story 3 ⚠️ (write first, must FAIL)

- [x] T029 [P] [US3] Test that under the app `.dark` class the `[data-preview-style="asciidoctor"]` content surface carries the fixed-light surface class/attribute while surrounding chrome keeps token classes, in `apps/web/tests/components/asciidoc-preview.test.tsx`

### Implementation for User Story 3

- [x] T030 [US3] Add light-only surface rules for `.asciidoc-preview-content[data-preview-style="asciidoctor"]` (fixed light background + vendored text colors, independent of the `.dark` class) in `apps/web/src/styles/asciidoc-preview.css`; keep the default Asciidocollab path token-driven (makes T029 green)
- [x] T031 [US3] Verify/refine the scoping in `apps/web/scripts/build-asciidoctor-style.mjs` so root selectors collapse onto the scope and nothing matches outside `.asciidoc-preview-content`; regenerate `asciidoctor-style.generated.css`

**Checkpoint**: All three stories independently functional; both styles legible in both color modes with no chrome leakage.

---

## Phase 6: Polish, Verification & Cross-Cutting Concerns

**Purpose**: Spec success-criteria verification and quality gates.

- [x] T032 [P] Verify style isolation — selecting Asciidoctor produces zero visible change to application chrome outside the preview content area (SC-005); capture in an e2e check in `apps/web/e2e/`
- [ ] T033 [P] Verify dark-mode legibility for both styles against a representative document (SC-006)
- [x] T034 [P] Verify per-user persistence across reload and across a second device/browser (SC-003), and brand default for a new user (SC-002)
- [x] T035 Verify no scroll-sync regression and that both styles render admonitions, code blocks, tables, and all four list types without broken layout (SC-004, SC-007); confirm sanitization path unchanged (FR-013)
- [x] T036 [P] Run the quickstart.md validation, including the vendored-CSS re-sync procedure (`build:asciidoctor-style`)
- [x] T037 Run quality gates across all touched packages: `pnpm lint`, `pnpm typecheck`, and `pnpm test` for `@asciidocollab/{domain,infrastructure,shared,api,web}`, plus `pnpm --filter @asciidocollab/web build` (confirms predev/prebuild regenerates the scoped CSS)
- [ ] T038 [P] Verify the no-flash initial render (SC-008/FR-016): for a user whose saved style is `asciidoctor`, a reload renders the preview directly in Asciidoctor with no observable flash of the Asciidocollab default before first paint; add an e2e assertion in `apps/web/e2e/`
- [ ] T039 [P] Verify per-collaborator view independence (FR-012, Constitution VII): two users viewing the same document with different selected styles each see their own style, and neither selection alters the shared document source or the other's preview; cover in `apps/web/e2e/`
- [x] T040 [P] Verify offline reconciliation (Edge "Offline persistence"): when the account save fails transiently, the chosen style still applies for the current session and is persisted to the account on the next successful save, in `apps/web/tests/hooks/use-editor-preferences.test.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories. T006←T004; T008←T002,T007; T009←T008.
- **US1 (Phase 3)**: Depends on Foundational (needs T006 value object, T009 styles, T010 control).
- **US2 (Phase 4)**: Depends on Foundational; T027/T028 build on the US1 hook + control wiring. Backend tasks (T020–T026) are independent of US1.
- **US3 (Phase 5)**: Depends on Foundational; independent of US2. (T030 touches the same CSS file edited nowhere else; T029 extends the US1 test file.)
- **Polish (Phase 6)**: Depends on all targeted stories being complete.

### User Story Dependencies

- **US1 (P1)**: Independently testable after Foundational — in-browser toggle + restyle.
- **US2 (P2)**: Adds durable account persistence + settings surface; reuses US1's hook field and shared control.
- **US3 (P2)**: Adds color-mode correctness + isolation; independent of US2.

### Within Each Story

- Tests first and failing, then implementation (Constitution II).
- Domain/value-object/entity before use-case before repo before route before client wiring.
- US2 fake parity (T023) supports the use-case/repo tests.

---

## Parallel Execution Examples

```bash
# Setup — independent files:
T002 Vendor asciidoctor-default.css
T003 Add web fonts in layout.tsx

# Foundational — independent:
T004 PreviewStyle VO test   |  T005 DEFAULT_PREVIEW_STYLE constant  |  T010 PreviewStyleControl

# US2 tests (all different files) together:
T016 entity test | T017 use-case test | T018 prisma repo test | T019 api route test
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & VALIDATE** (header toggle
   restyles instantly, persists per-browser, source untouched) → demo.

### Incremental Delivery

1. Setup + Foundational → styling + primitives ready.
2. US1 → in-session/per-browser style switching (MVP).
3. US2 → durable per-user, cross-device persistence + settings surface.
4. US3 → color-mode correctness + isolation.
5. Polish → verify all success criteria + gates.

---

## Notes

- [P] = different files, no incomplete dependencies.
- The PUT-400 coupling is avoided by design: US1 persists `previewStyle` to localStorage only; US2
  adds the API/db acceptance and switches the hook to also sync via the endpoint.
- Stored token values (DB column, DTO enum, `data-preview-style` attribute, `PreviewStyle` VO, `DEFAULT_PREVIEW_STYLE`) are exactly `asciidocollab` and `asciidoctor` (lowercase). The UI display labels are "Asciidocollab" and "Asciidoctor", mapped in `PreviewStyleControl` — never compare against the labels in code.
- Commit after each task or logical group; never commit with failing tests (Constitution II).
