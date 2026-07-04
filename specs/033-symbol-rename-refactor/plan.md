# Implementation Plan: In-Editor Symbol Rename Refactor Suggestion

**Branch**: `033-symbol-rename-refactor` | **Date**: 2026-07-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/033-symbol-rename-refactor/spec.md`

## Summary

Add a proactive, in-editor suggestion that detects when an author renames a symbol **at its definition site** (explicit anchor/ID, attribute definition, or a section heading whose auto-generated ID is referenced) and offers a one-click, project-wide refactor of all usages to the new name. Detection and apply **reuse the existing cross-file refactoring capability** (`FindReferencesUseCase` / `RenameSymbolUseCase` and the `symbol-usages` / `symbol-rename` routes), which already scan/write **live Hocuspocus content**, enforce authorization in the domain, and emit audit logs. The new work is almost entirely **client-side editor UX** (detection of a definition-site rename, the 2s/5s timing + location state machine, the inline suggestion widget) plus **two targeted server-side extensions**: (1) support renaming a **heading-derived ID** (the existing endpoints only accept `anchor | attribute`), and (2) a **new, higher rate-limit budget for the read-only detection path**, because proactive detection calls `symbol-usages` far more often than the old manual dialog did.

## Technical Context

**Language/Version**: TypeScript (strict), Node.js (API), React 18 (web)

**Primary Dependencies**: CodeMirror 6 (`@codemirror/view`, `/state`, `/lint`) for the editor + inline suggestion; Yjs + Hocuspocus (`y-codemirror.next`) for collaboration; Fastify (API) with `@fastify/rate-limit`; Convict + YAML for config

**Storage**: Existing project file storage (git-sandboxed) via `fileStore`/`documentRepo`; audit via `auditLog` repo. No new persistent storage.

**Testing**: Domain use-case unit tests with in-memory fakes (Principle III); API integration tests; Playwright e2e for the editor timing/location behavior and apply flow

**Target Platform**: Web application (browser client + Fastify API + Hocuspocus collaboration server)

**Project Type**: Web application (monorepo: `apps/web`, `apps/api`, `packages/domain`, `packages/asciidoc-core`)

**Performance Goals**: No perceptible typing lag during detection (FR-025/SC-007); suggestion appears within ~2s of the author stopping (SC-001). Detection must not saturate the refactoring rate limit under normal interactive editing.

**Constraints**: Reuse the single existing refactor implementation — no parallel apply path (FR-018a). Timing thresholds (2s show / 5s hide-on-leave) are fixed, not configurable (spec Assumptions).

**Scale/Scope**: Project-wide search across every AsciiDoc file in a project; a project may contain many files, so detection fan-out cost and its rate-limit budget must be bounded.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| **II. TDD (NON-NEGOTIABLE)** | PASS — every task implemented via `/tdd`. Domain extension (heading-ID rename) uses in-memory fakes; detection state machine and timing are unit-tested; apply + timing covered by e2e. |
| **III. In-memory fakes** | PASS — reuse existing fakes for `projectMember`, `fileNode`, `fileStore`, `document`, `auditLog`; extend them for the heading-ID rename path. |
| **IV. Reuse before rebuild** | PASS — this feature is explicitly a reuse of `FindReferencesUseCase` / `RenameSymbolUseCase`; no re-derivation. Heading-ID support is an **extension** of that first-party asset, not a fork. |
| **V. Theming via design tokens** | PASS (to enforce) — the inline suggestion widget MUST derive all colors from design tokens and be correct in light/dark mode; no hardcoded color literals. |
| **VI. Style isolation** | N/A — the suggestion is app chrome inside the editor, not rendered-document style; it MUST NOT be injected into the preview surface. |
| **VII. Per-user preferences, shared-content immutability** | PASS — the suggestion is a **local, per-author hint** not shown to collaborators (FR-024). Applying it mutates shared content, but as an **explicit, permission-gated edit** (editor/owner), not a preference-driven silent mutation. Fixed 2s/5s timings are product constants, not per-user preferences. |
| **VIII. Editor pipeline integrity** | PASS — the feature rewrites **document source**, not the preview render path; the existing sanitizer is untouched. Scroll-sync seam is not modified; the suggestion widget MUST NOT regress scroll-sync (covered by e2e). |
| **IX. Untrusted input boundary (NON-NEGOTIABLE)** | PASS — the new symbol name is user input written into `.adoc` source (not a new render path). It MUST be validated as a well-formed symbol name and length-bounded (existing routes cap `name` at 200 chars). No path/include/URL resolution is introduced, so no new SSRF/traversal surface. Preview continues to sanitize on render, unchanged. |
| **Security constitution — RBAC in domain** | PASS — authorization stays in the use cases (`find-references` requires membership; `rename-symbol` requires editor/owner). No route-level or client-side permission logic is added. |
| **Security constitution — Audit** | PASS — apply reuses `RenameSymbolUseCase`, which already records `AUDIT_SYMBOL_RENAMED` (and logs authorization denials). The heading-ID extension MUST preserve this audit emission. |
| **Security constitution — Rate limiting (amplifying/fan-out reads)** | **ACTION REQUIRED (compliant by design)** — detection auto-fires the fan-out `symbol-usages` read; it MUST remain rate-limited, and the limit MUST be **configurable via YAML/env, never hardcoded**. The current shared 60/hour budget is too low for interactive detection → introduce a dedicated, configurable detection budget (see Security & Configuration below). |

**Result**: No unjustified violations. One security **action** (rate-limit budget for the new detection path) is designed in, not deviated from. No Complexity Tracking entries required.

## Security & Configuration Analysis (answers the `/speckit-plan` request)

**What the existing code already gives us (no new work / no new risk):**
- Authorization is enforced in the domain: `symbol-usages` → project membership; `symbol-rename` → editor/owner, with denials audit-logged (`packages/domain/src/use-cases/content/{find-references,rename-symbol}.ts`).
- Both paths already integrate **live Hocuspocus/Yjs** content (`collaborativeContentEditor`, `document` repo), so FR-006a/FR-018a ("consider Hocuspocus file changes") are **already satisfied**; no parallel path is created.
- Rename already emits `AUDIT_SYMBOL_RENAMED { symbolKind, oldName, newName, rewrittenFiles }`.
- Rate limiting already exists and is YAML/env-configurable: `project.refactoring.rateLimitMax` (default 60) / `rateLimitWindow` (default 1h) in `apps/api/src/config/schema-project.ts`, bound to `ASCIIDOCOLLAB_PROJECT_REFACTORING_RATE_LIMIT_*`.
- Data isolation by `projectId`; search never crosses projects. All files in a project are visible to its members, so per-file usage counts leak nothing beyond project membership.

**New security concerns introduced by *this* feature and their resolution:**

1. **Amplification of the read path (primary concern).** Proactive detection fires `symbol-usages` (a whole-project fan-out scan) every time the author settles on a rename for 2s, and re-fires on each subsequent settle. The existing **shared 60-requests/hour** budget was sized for an occasional *manual* dialog; under auto-detection a single active editing session would exhaust it and get 429s, breaking the feature (and the fan-out scan is itself the amplifying cost the security constitution calls out). **Resolution:** split the read (detection) budget from the write (apply) budget, and give detection a higher, still-bounded, **configurable** budget. Reduce calls client-side: debounce (the 2s settle), cache the last result per (symbol kind, old name), and skip the call when the old name/content is unchanged or has no candidate.

2. **Self-inflicted DoS via large projects.** The fan-out scan cost grows with project size. **Resolution:** keep the scan server-side (already bounded to AsciiDoc files) and add a **configurable cap** on detection frequency (budget above) plus optional max-project-file cap for detection. Timing constants stay fixed.

3. **Name validation (Principle IX).** The new name is written into shared source. **Resolution:** validate it is a well-formed symbol of its kind and within length bounds before offering apply (routes already enforce `minLength:1, maxLength:200`); collision with an existing same-kind symbol **blocks** apply (FR-022).

4. **Heading-ID rename gap.** The existing endpoints accept only `symbolKind: 'anchor' | 'attribute'`. US3 (heading-derived IDs) requires either a new `heading`/`section` kind or mapping a heading rename onto an anchor-style rename of the derived ID. This is a functional extension, but it must **preserve** the existing authorization + audit behavior (do not bypass the use case).

**Options to define in the YAML** (`apps/api/config/default.yaml` + `apps/api/src/config/schema-project.ts`), mirroring the existing `refactoring` block:

```yaml
project:
  refactoring:
    rateLimitMax: 60          # existing — the WRITE/apply (symbol-rename) budget (unchanged, conservative)
    rateLimitWindow: 3600000  # existing — 1h
    # NEW — read-only detection (symbol-usages) budget, sized for interactive auto-detection:
    suggestionRateLimitMax: 600         # env ASCIIDOCOLLAB_PROJECT_REFACTORING_SUGGESTION_RATE_LIMIT_MAX
    suggestionRateLimitWindow: 3600000  # env ASCIIDOCOLLAB_PROJECT_REFACTORING_SUGGESTION_RATE_LIMIT_WINDOW
```

Rationale: applies the security-constitution rule ("when limited, the limit MUST be configurable, never a hardcoded literal") to the new, more-frequent read path, and decouples it from the deliberately conservative write budget so detection never blocks apply and vice-versa. Defaults are documented; both are env-overridable. The `symbol-usages` route is re-pointed to the new `suggestionRateLimit*` values; `symbol-rename` keeps the existing budget. The route contracts note the `429` response.

**Spec reconciliation flagged for tasks:** FR-019 / the "partial permissions" edge case assume per-file permission failures, but authorization is **project-scoped** (editor/owner for the whole project). In practice apply is authorized wholesale or denied wholesale; "files not updated" arises from concurrent-write/conflict, not per-file permissions. Tasks should interpret FR-019 as reporting **conflict/write failures**, and treat a permission failure as a single whole-operation denial (already audit-logged).

## Project Structure

### Documentation (this feature)

```text
specs/033-symbol-rename-refactor/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (reused + extended endpoints, new config)
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
apps/web/src/
├── lib/codemirror/
│   ├── asciidoc-symbol-at-cursor.ts         # reuse: definition/kind detection at cursor
│   ├── rename-suggestion/                    # NEW: detection state machine + timing (2s/5s) + widget
│   │   ├── rename-detector.ts                #   capture old name at edit start; detect definition-site change
│   │   ├── rename-suggestion-state.ts        #   ViewPlugin/StateField: show/hide/return timing
│   │   └── rename-suggestion-widget.tsx      #   inline suggestion UI (design-token themed)
│   └── ...
├── hooks/
│   └── use-project-symbol-index.ts           # reuse for local candidate pre-check (include-tree); server confirms project-wide
├── lib/api/projects.ts                        # reuse: findSymbolUsages / renameSymbol; extend kind for headings
└── components/editor/asciidoc-editor.tsx      # wire the extension in

apps/api/src/
├── config/schema-project.ts                   # EXTEND: add suggestionRateLimit{Max,Window}
├── config/... (default.yaml)                  # EXTEND: default values + docs
└── routes/projects/refactoring.ts             # EXTEND: usages route uses suggestion budget; add heading kind

packages/domain/src/use-cases/content/
├── find-references.ts                          # reuse; extend to resolve heading-derived IDs if needed
└── rename-symbol.ts                            # EXTEND: support heading/section-derived-ID rename, keep audit + authz
```

**Structure Decision**: Web-application monorepo. The bulk of new code is the client editor extension under `apps/web/src/lib/codemirror/rename-suggestion/`. Server changes are limited to two extensions of existing files (config option + heading-ID rename kind). No new packages.

## Complexity Tracking

> No Constitution Check violations require justification. Section intentionally empty.
