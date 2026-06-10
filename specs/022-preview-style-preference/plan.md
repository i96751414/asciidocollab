# Implementation Plan: Per-User Preview Style Preference

**Branch**: `022-preview-style-preference` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-preview-style-preference/spec.md`

## Summary

Let each authenticated user choose how the AsciiDoc preview renders — **Asciidocollab** (default brand look, follows app light/dark mode) or **Asciidoctor** (the official AsciiDoc docs look, light-only). The choice is a per-user preference persisted alongside the existing editor preferences, exposed both in the preview pane header and the settings screen, and applied client-side by toggling a `data-preview-style` attribute on the preview content element. The Asciidoctor look reuses the MIT-licensed `asciidoctor-default.css`, vendored verbatim and selector-scoped at build time so it cannot leak into the application chrome. No change to content generation, sanitization, or scroll-sync.

## Technical Context

**Language/Version**: TypeScript 5.x (strict); Node 20; React 19; Next.js 16 (App Router)

**Primary Dependencies**: Tailwind v4 + shadcn/ui (web); Fastify (api); Prisma (db); `postcss-prefix-selector` (new dev dependency for CSS scoping) — fallback: native Shadow DOM (no dependency)

**Storage**: PostgreSQL via Prisma — extend the existing `editor_preferences` table with one nullable-with-default column (`previewStyle`)

**Testing**: Jest + Testing Library (web), Jest + in-memory fakes (domain), Jest + testcontainers (infrastructure), Jest (api routes), Playwright (e2e)

**Target Platform**: Modern evergreen browsers; SSR via Next.js

**Project Type**: Modular monolith (web frontend + Fastify api + clean-architecture packages)

**Performance Goals**: Style switch perceptible as instant — client-side attribute flip, well under 1 s (SC-001); no flash of default on initial load (FR-016 / SC-008)

**Constraints**: Additive only; MUST NOT modify sanitization (FR-013) or scroll-sync (FR-014) beyond the optional Shadow-DOM fallback; both styles MUST pass `pnpm typecheck` and `pnpm build`; Asciidoctor styling MUST stay confined to `.asciidoc-preview-content` (FR-010); Asciidoctor renders light regardless of app dark mode (FR-009)

**Scale/Scope**: One preference field; ~2 UI controls; one vendored stylesheet + one generated scoped stylesheet; touches all clean-architecture layers (shared → domain → infrastructure → db → api → web), mirroring the existing `softWrap` field precedent.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|-----------|
| **I. Clean Code** | PASS. `previewStyle` modeled as a validated value object `PreviewStyle` mirroring the existing `EditorTheme` VO; allowed values are a named union, not magic strings; default lives in `constants/editor-preferences.ts`. |
| **II. TDD (NON-NEGOTIABLE)** | PASS by plan. Each layer gets a failing test first: `PreviewStyle` VO test, `EditorPreferences` entity test (new field), save/get use-case tests, in-memory fake parity, Prisma repo integration test, API route test, and web component/hook tests. No production code before red. |
| **III. Seam testing with in-memory fakes** | PASS. The existing `in-memory-editor-preferences.repository.ts` fake is extended to carry `previewStyle` with identical semantics to the Prisma repo; no mocking libraries for repository behavior. |
| **Architecture — layering** | PASS. Dependencies flow inward: DTO in `packages/shared`, entity/VO/use-cases in `packages/domain`, Prisma impl in `packages/infrastructure`, schema in `packages/db`, route in `apps/api`, UI in `apps/web`. Domain imports no infrastructure. |
| **Architecture — contracts** | PASS. The `EditorPreferencesDto` in `packages/shared` is the single cross-boundary type; extended, not duplicated. Fastify schema validation at the boundary; FR-015 graceful fallback enforced in the repository's `toDomain` mapping (default rather than throw on unrecognized stored value). |
| **Security** | PASS. Reuses the existing authenticated `/auth/me/editor-preferences` endpoint (no new surface); preview is authenticated-only (no guest handling — per clarification). Vendored CSS is static, license-preserved, build-time scoped; no secrets, no new external calls at runtime. Sanitization path unchanged. |

**Result: PASS — no violations. Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/022-preview-style-preference/
├── plan.md              # This file
├── research.md          # Phase 0 output — stylesheet source/license, fonts, scoping approach
├── data-model.md        # Phase 1 output — previewStyle preference, default, storage, validation
├── quickstart.md        # Phase 1 output — switching styles + re-syncing vendored CSS
├── contracts/           # Phase 1 output — API + UI contracts
│   ├── editor-preferences-api.md
│   └── preview-style-ui.md
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/shared/src/dtos/editor-preferences.dto.ts          # + previewStyle field
packages/domain/src/value-objects/preview-style.ts          # NEW — PreviewStyle VO (mirrors editor-theme.ts)
packages/domain/src/value-objects/index.ts                  # export PreviewStyle
packages/domain/src/constants/editor-preferences.ts         # + DEFAULT_PREVIEW_STYLE
packages/domain/src/entities/editor-preferences.ts          # + previewStyle (last optional ctor param, default brand)
packages/domain/src/use-cases/settings/save-editor-preferences.ts  # accept + persist previewStyle
packages/domain/src/use-cases/settings/get-editor-preferences.ts   # (no change if it returns the entity)
packages/domain/tests/ports/user/in-memory-editor-preferences.repository.ts  # carry previewStyle
packages/infrastructure/src/persistence/user/prisma-editor-preferences.repository.ts  # map column, FR-015 fallback
packages/db/prisma/schema.prisma                            # + previewStyle String @default("asciidocollab")
apps/api/src/routes/editor-preferences.ts                   # GET/PUT schema + DTO mapping

apps/web/src/styles/vendor/asciidoctor-default.css          # NEW — vendored verbatim (MIT header preserved)
apps/web/src/styles/asciidoctor-style.generated.css         # NEW — generated, scoped, committed
apps/web/scripts/build-asciidoctor-style.mjs                # NEW — prefixes selectors, emits generated css
apps/web/src/styles/asciidoc-preview.css                    # + light-only surface rules for [data-preview-style="asciidoctor"]
apps/web/src/app/layout.tsx                                 # + Open Sans / Noto Serif / mono via next/font (CSS vars)
apps/web/src/hooks/use-editor-preferences.ts               # + previewStyle in prefs + setter + LS + API sync
apps/web/src/components/asciidoc-preview.tsx               # data-preview-style attr + Style control in header
apps/web/src/components/preview-style-control.tsx          # NEW — shared shadcn segmented/select control
apps/web/src/app/(dashboard)/dashboard/settings/editor-preferences-card.tsx  # + Style control
apps/web/src/components/editor/asciidoc-editor.tsx         # thread previewStyle from prefs to AsciiDocPreview
apps/web/package.json                                      # + postcss-prefix-selector (dev); + predev/prebuild step
```

**Structure Decision**: Reuse the existing `editor_preferences` slice end-to-end (the same store/hook/API/table that backs `softWrap`), adding exactly one field across the layers. The only net-new build machinery is the vendored Asciidoctor stylesheet, its build-time scoping script, and the shared Style control component.

## Key Design Decisions

1. **Style application** — set `data-preview-style="asciidocollab" | "asciidoctor"` on the existing `.asciidoc-preview-content` element (lowercase token values; the UI maps them to the display labels "Asciidocollab" / "Asciidoctor"). The brand CSS (the default `asciidoc-preview.css`) is unchanged and remains the no-attribute / `asciidocollab` baseline. (FR-001, FR-004, FR-008)

2. **Scoping the vendored CSS (primary)** — `apps/web/scripts/build-asciidoctor-style.mjs` runs `postcss-prefix-selector`, prefixing every selector with `.asciidoc-preview-content[data-preview-style="asciidoctor"]`, mapping root selectors (`html`, `body`, `:root`, `*`) onto the scope itself and leaving at-rules intact, emitting `asciidoctor-style.generated.css`. Wired as a `predev`/`prebuild` step and the generated file is committed (matching the repo's committed-generated-artifact convention for the lezer parser). The generated file is imported once so the rules exist whenever the attribute is set. (FR-010, SC-005)
   - **Fallback (only if PostCSS scoping proves awkward)**: render Asciidoctor output in a Shadow DOM on the preview content host, inject the vendored CSS unscoped, and update the scroll-sync `querySelector`(`All`) calls in `useAsciidocPreview` to read from `shadowRoot`. Prefer PostCSS unless that change is small.

3. **Light-only Asciidoctor surface** — while `data-preview-style="asciidoctor"`, the preview scroll/content surface gets a fixed light background and the vendored colors regardless of app dark mode; the pane chrome (header row, buttons) stays app-themed. Asciidocollab keeps following light/dark via tokens. (FR-009, US3)

4. **Preference storage** — add `previewStyle` (default `'asciidocollab'`) to the **existing** editor-preferences mechanism (`use-editor-preferences.ts` ↔ `/auth/me/editor-preferences` ↔ `editor_preferences` table). No parallel store. Per-user persistence is automatic via the existing localStorage-cache + debounced PUT + GET-on-mount flow. (FR-002, FR-005, FR-007)

5. **One preference, two surfaces** — a shared `PreviewStyleControl` (compact shadcn segmented control / two-option select) is placed in the preview header row alongside the sync/collapse buttons and in `editor-preferences-card.tsx`. Both read/write the same `useEditorPreferences().previewStyle`, so they stay in sync by construction. (FR-003, FR-006)

6. **No-flash initial render (FR-016)** — the preview component reads `previewStyle` from the synchronously-seeded preference (localStorage seed in `useState` initializer, as `softWrap` already does) and sets `data-preview-style` on the content element in the same render that injects HTML, so the correct style is present before first paint; the imported generated CSS is already in the bundle.

7. **FR-015 graceful fallback** — unlike `EditorTheme.parse` (which the Prisma repo treats as fatal), an unrecognized stored `previewStyle` maps to the `asciidocollab` default in `toDomain` rather than throwing, because the spec mandates the preview must still render. The client `loadFromStorage`/GET parsing applies the same default-on-invalid rule.

## Complexity Tracking

> No constitution violations — section intentionally empty.
