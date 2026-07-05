# Implementation Plan: Project-Wide Find and Replace Panel

**Branch**: `037-project-find-replace` | **Date**: 2026-07-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/037-project-find-replace/spec.md`

## Summary

Add a **Search** tab to the editor's left panel (a third tab beside Files and Outline) that searches and replaces text across **every text-decodable file in a project**, and restyle the in-editor CodeMirror find/replace so it matches the app's design system.

The whole server spine already exists as the symbol-rename feature and is reused almost verbatim: a use case scans each file's **live-or-stored** content (`resolveFileContent`/`liveContentDeps` — live Yjs text when a collaborative room exists, else the file-store projection), and writes through the **Yjs source of truth** via the collab server's `openDirectConnection` (`apps/collab/src/apply-edits.ts`), which transparently handles the two cases the user called out: an **open session** receives the edit instantly; a **file with no session** is loaded from its authoritative Yjs state, edited in a transaction, written back (Yjs blob + plain text), and unloaded. The plain `PUT …/content` save path is deliberately *not* used — it refuses to write while a session is active (409). Authorization lives in the use cases (member to search, editor/owner to replace), replaces are audit-logged, and the search/replace routes are rate-limited with config-driven budgets because they fan out over the whole project.

Two things are genuinely new. **(1) A safe regex engine.** User-supplied regular expressions are untrusted input; per Principle IX and the security constitution ("regexes MUST be linear-time, no catastrophic backtracking") they MUST run on a **linear-time engine (RE2)**, never JS `RegExp` backtracking, with pre-compile validation and per-file/total budgets. The engine is injected through a domain **port** (domain stays zero-dependency); an RE2-backed adapter lives in infrastructure and in the collab apply path. **(2) A structured, position-and-selection-aware apply.** The existing `applyReplacements` port is *occurrence-global literal* ("replace every occurrence of `find`"), which is wrong for regex capture-group substitution and for per-match include/exclude (FR-008a). So find/replace applies through a **new structured-apply primitive** that re-matches the query against the live Y.Text **inside the direct-connection transaction** and rewrites exactly the confirmed match spans — keeping a single write path (still Yjs-authoritative, still stale-skipping and merge-safe), never a parallel plain-text write.

## Technical Context

**Language/Version**: TypeScript (strict), Node 24. Web = Next.js 16 (App Router, React 19) client component; API = Fastify; Collab = Hocuspocus 4 (`@hocuspocus/server`).

**Primary Dependencies**: existing — Yjs `Y.Text`, Hocuspocus (`openDirectConnection`), CodeMirror 6 (`@codemirror/search`), `@asciidocollab/asciidoc-core`, Fastify + `@fastify/rate-limit`, Convict + YAML config, SSE (`EventSource`/`SharedWorker`), Prisma. **New runtime dependency: a linear-time regex engine (RE2 — e.g. the `re2` Node binding)** used only server-side (API scan + collab apply) for user-supplied patterns.

**Storage**: PostgreSQL via Prisma — **no schema change, no migration**. Audit actions are string constants (`packages/domain/src/audit-actions.ts`); a new `AUDIT_PROJECT_CONTENT_REPLACED` is a constant, not a DB enum. File content continues to live as the Yjs state blob (source of truth) + plain-text projection; search/replace never adds a store.

**Testing**: Jest + Testing Library (unit); domain use cases with in-memory fakes (Principle III), including a fake regex engine + a fake structured-apply editor; infrastructure integration via testcontainers where applicable; Playwright two-client E2E for the open-session-vs-dormant-file replace, regex, and selective-exclude flows.

**Target Platform**: Browser (editor client) + Node services (API, collab). Linux server deploy.

**Project Type**: Web application — modular monolith (`apps/web`, `apps/api`, `apps/collab`; `packages/domain`, `packages/infrastructure`, `packages/shared`, `packages/asciidoc-core`).

**Performance Goals**: Search feels interactive — first results within ~1s for a typical project (SC-002); display capped at ~1,000 matches with the true total shown (FR-016). **No user-supplied pattern can hang the UI or degrade other collaborators** — worst-case bounded by the RE2 linear-time guarantee plus per-file time/size budgets (SC-008). Per Principle II these are functional/qualitative acceptance checks, not added latency benchmarks (no perf tests unless the spec requests them — it does not).

**Constraints**: Reuse the rename/apply-edits spine (single Yjs-authoritative write path; **never** the 409-guarded plain `PUT …/content`). Domain layer stays zero-dependency (regex engine injected via port). No preview-sanitizer change and no scroll-sync change. All budgets/limits config-driven via `apps/api/src/config/schema-project.ts` (+ collab config) — no hardcoded literals. Search/replace strictly project-scoped (membership-gated; `projectId` isolation).

**Scale/Scope**: Project-wide over every text-decodable file (not just `.adoc`, not just include-reachable). Fan-out cost grows with project size, so it is server-side, budgeted, and rate-limited.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment |
|---|---|
| **I — Clean Code** | PASS. Small, intent-named units; typed `Result<T,E>` on all fallible domain ops; budgets/limits are named config, no magic numbers. Match semantics live in one shared pure helper so search and apply agree (mirrors the existing shared `content-replacements.ts`). |
| **II — TDD (NON-NEGOTIABLE)** | PASS. Every task via `/tdd`. Domain search/replace use cases use in-memory fakes (member repo, file-node repo, file store, document repo, live reader, structured-apply editor, **regex-engine port**, audit log). Matcher (literal + whole-word + regex-via-fake-engine), budget accounting, and selection/stale-skip are unit-tested; collab structured-apply is integration-tested against a real Y.Doc; two-client E2E covers open-session + dormant-file replace, regex substitution, and per-match exclude. Perf is opt-in → SC-002/SC-008 verified qualitatively in quickstart (interactive feel; ReDoS pattern stays bounded), not as latency benchmarks. |
| **III — Seam testing with in-memory fakes** | PASS. Each new domain port (the **regex engine** and the **structured collaborative editor**) gets an in-memory fake under `packages/domain/tests/ports/…`. No mocking of repository behavior. |
| **IV — Reuse before rebuild** | PASS (strong reuse). Reuses `resolveFileContent`/`liveContentDeps` (live-aware read), the `openDirectConnection` apply spine + internal collab HTTP channel, the `refactoring.ts` route/RBAC/rate-limit template, the config-schema pattern, the left-panel tab system (one-line `VIEWS` append + a `searchSlot`), the `FindPanel` styling precedent, and the `content-changed` SSE. The regex engine is a **vendored well-licensed library (RE2)**, not a hand-rolled automaton — reuse-before-rebuild applied to the engine. The structured-apply is an **extension of the first-party `apply-edits.ts`**, not a fork of a vendored file. |
| **V — Theming via design tokens** | PASS (to enforce). The Search tab and the **restyled in-editor find/replace** MUST derive every color from design tokens and be correct in light and dark mode — no hardcoded literals. Tracked as task acceptance criteria. |
| **VI — Style isolation** | N/A (compliant). All new UI is **app chrome** (left-panel tab + editor panel), never injected into the preview/rendered-document surface; no document-rendering stylesheet is touched. |
| **VII — Per-user preferences, shared-content immutability** | PASS. The active left-panel tab (`'search'`) is a per-user, client-only preference in the existing `use-editor-preferences` store (localStorage, `CLIENT_ONLY_KEYS`) — not shared state. Replace mutates shared content, but only as an **explicit, permission-gated (editor/owner), user-confirmed** edit — never a preference-driven silent mutation. |
| **VIII — Editor pipeline integrity (sanitization & scroll-sync)** | PASS — called out per the principle. Find/replace edits **document source**, not a render path; the preview sanitizer is **untouched** and re-applies on render as today. A user regex is treated as **inert data** — compiled and matched, never evaluated as code. The restyle changes only the search-panel **chrome**; the scroll-sync seam is not modified and E2E asserts no regression. |
| **IX — Untrusted Input Boundary (NON-NEGOTIABLE)** | PASS — this is the security core. User-supplied **regex is untrusted**: it MUST run on a **linear-time engine (RE2), never backtracking**, be **validated/compiled before use** (invalid → inline error, never run/hang), and be **budget- and cancellation-bounded** (per-file time/size, total-match cap, max pattern length) so no pattern can starve the UI or other collaborators. Replacement text written into files is length-bounded and validated; **no new path/include/URL/attribute resolution is introduced**, so no new SSRF/traversal surface — search/replace stays within the project's existing storage sandbox (`projectId` scoping). Binary/non-text files are excluded (text-decodability detection at the boundary). |
| **Security — RBAC in domain** | PASS. `SearchProjectContentUseCase` requires project membership; `ReplaceProjectContentUseCase` requires editor/owner. Enforced in the use cases (no route-level or client-side auth); denials audit-logged via `recordAuthorizationDenial`. |
| **Security — Audit** | PASS. Replace records `AUDIT_PROJECT_CONTENT_REPLACED` with actor, project, scope, query mode, and per-file/total replaced counts (no secret/PII content). |
| **Security — Rate limiting (amplifying/fan-out routes)** | PASS by design. Search and replace both fan out over the whole project → both are rate-limited with **config-driven, env-overridable** budgets under `project.search.*` (search = higher, read budget; replace = conservative, write budget), mirroring the `refactoring` precedent; contracts note the `429`. No hardcoded limits. |
| **Security — Data isolation** | PASS. All scans/writes filter by `projectId`; no cross-project access; results visible only to project members (matches the project's membership-level access model). |
| **Architecture layering** | PASS. Business rules (scan orchestration, match/selection semantics, budgets, RBAC) in domain use cases; routes and the collab apply endpoint are thin delivery; RE2 lives in infrastructure/collab behind a domain port; DTOs in `packages/shared`. No domain→infra import; no `any`/`as` in production. |
| **DB migration policy** | PASS. No schema change → no migration → no user ask required. (If a task discovers an audit field must become a DB column/enum, the agent MUST ask before migrating.) |

**Result: PASS — no unjustified violations.** Two items are security work *designed in*, not deviations: the linear-time regex engine (Principle IX) and the config-driven rate limits. Complexity Tracking is not required.

## Security & Dual-Path Analysis (answers the `/speckit-plan` request)

**Replacing text with vs. without an open Yjs session — already solved by the reused spine.** The apply path is `StructuredCollaborativeEditor` (new port) → `HttpStructuredCollaborativeEditor` (infra) → collab `POST /internal/collab/apply-structured-replacement` → `applyStructuredReplacementToDocument` → `hocuspocus.openDirectConnection(projectId/yjsStateId)`:
- **Open session (live room):** the direct connection attaches to the in-memory room; connected editors see the replacement immediately; the edit merges with concurrent edits inside one Yjs transaction (FR-011).
- **No open session (dormant file):** `openDirectConnection` loads the room from the **authoritative Yjs state** (never the possibly-stale plain-text file); the edit is applied in a transaction; `disconnect()` forces the normal writeback (Yjs blob **and** plain text) and unloads the room.
- **Never the plain save path:** the plain `PUT …/content` (`SaveDocumentContentUseCase`) refuses to write while a session is active (409) and would be clobbered by the next writeback — so it is not used for bulk replace.
- **Files with no Document record at all** (rare — never opened) fall back to a direct `fileStore.write`, exactly as the rename use case does.
- **Stale-safe:** a confirmed match whose text no longer exists at apply time is skipped, not failed (FR-017); a file whose live content diverged from the scan yields 0 applied for that file — surfaced, not force-written.

**Why a new structured-apply (not the existing literal port).** `applyReplacements` replaces *every* occurrence of a literal `find`. That is correct for the rename feature (unique macros) and for a literal "replace all in file with no exclusions", but wrong for (a) **regex**, where each match's replacement differs by capture group, and (b) **per-match include/exclude** (FR-008a), where identical text may be selected in one place and not another. The structured-apply re-runs the query (literal or RE2 regex) against the **current live Y.Text within the transaction**, computes exact spans, and rewrites only the confirmed selection — expressed concurrency-robustly (per-file **ordinal + expected match text**) so re-matching after concurrent edits stays correct and stale-skips cleanly. This keeps one Yjs-authoritative write path and preserves the merge/skip guarantees.

**Regex threat model (Principle IX + security constitution).** User patterns are the primary new attack surface (ReDoS / self-inflicted DoS across every file). Mitigations, all config-driven: (1) **RE2 linear-time engine** — no catastrophic backtracking possible by construction (tradeoff: no backreferences/lookaround, an accepted loss); (2) **pre-compile validation** — invalid pattern → inline error, nothing runs; (3) **budgets** — `maxPatternLength`, per-file time/size caps, total-match cap (~1,000 shown + true total), cancelable sweep (AbortController client-side, bounded work server-side); (4) **rate limiting** the fan-out routes. `eslint-plugin-redos` continues to guarantee our *own* source regexes are linear — the RE2 engine extends that same guarantee to *runtime user* regexes.

**Config to add** (`apps/api/src/config/schema-project.ts` + `apps/api/config/default.yaml`), mirroring the `refactoring` block:

```yaml
project:
  search:
    rateLimitMax: 120          # read/search budget (env ASCIIDOCOLLAB_PROJECT_SEARCH_RATE_LIMIT_MAX)
    rateLimitWindow: 3600000   # 1h
    replaceRateLimitMax: 30    # conservative write/replace budget
    replaceRateLimitWindow: 3600000
    maxMatchesReturned: 1000   # FR-016 display cap (true total still reported)
    maxPatternLength: 1000     # FR-006c
    perFileTimeBudgetMs: 250   # FR-006c per-file evaluation budget
    maxFileBytes: 2000000      # skip/flag files larger than this for match evaluation
```

## Project Structure

### Documentation (this feature)

```text
specs/037-project-find-replace/
├── plan.md              # This file
├── research.md          # Phase 0 — engine choice, structured-apply, text-file detection, cap/selection
├── data-model.md        # Phase 1 — DTOs, entities, ports (no DB change)
├── contracts/           # Phase 1 — search + replace routes, internal structured-apply, client behaviors
│   ├── search-project-content.md
│   ├── replace-project-content.md
│   ├── internal-collab-structured-apply.md
│   └── client-search-panel-behavior.md
├── quickstart.md        # Phase 1 — two-client validation mapped to SCs
├── checklists/
│   └── requirements.md  # (from /speckit-specify)
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (files this feature touches)

```text
packages/shared/src/dtos/
├── project-search.dto.ts             # NEW: SearchQueryDto, SearchMatchDto, FileMatchGroupDto, SearchResultDto
└── project-replace.dto.ts            # NEW: ReplaceRequestDto (scope + selection), ReplaceResultDto

packages/domain/src/
├── ports/text/
│   └── regex-engine.ts               # NEW port (service, NOT storage): compile(pattern, flags) → linear-time matcher | ValidationError
├── ports/storage/
│   └── structured-collaborative-editor.ts  # NEW port: applyStructuredReplacement(projectId, yjsStateId, spec)
├── use-cases/content/
│   ├── search-project-content.ts     # NEW: RBAC(member) + scan all text files (live-aware) + match + budgets
│   │                                 #   also defines domain types SearchQuery/SearchMatch/FileMatchGroup/SearchResult
│   ├── replace-project-content.ts    # NEW: RBAC(editor/owner) + apply confirmed selection + audit
│   │                                 #   also defines domain types FileReplaceSelection/ReplaceOutcome
│   └── text-match.ts                 # NEW pure helper: literal/whole-word/regex span computation + selection
│                                     #   (shared by search + structured-apply so both agree — like content-replacements.ts)
├── value-objects/files/
│   └── searchable-text-file.ts       # NEW: text-decodability predicate (content sniff; excludes binary)
└── audit-actions.ts                  # EXTEND: AUDIT_PROJECT_CONTENT_REPLACED constant

packages/infrastructure/src/services/
├── re2-regex-engine.ts               # NEW: RE2-backed RegexEngine adapter (linear-time)
└── http-structured-collaborative-editor.ts  # NEW: POSTs to collab structured-apply internal endpoint

apps/collab/src/
├── apply-edits.ts                    # EXTEND: applyStructuredReplacementToDocument (re-match live Y.Text in-tx)
└── internal-edit-server.ts           # EXTEND: POST /internal/collab/apply-structured-replacement

apps/api/src/
├── config/schema-project.ts          # EXTEND: project.search.* budgets + rate limits
├── config/… (default.yaml)           # EXTEND: defaults + env docs
├── di/stores.ts                      # wire re2RegexEngine + httpStructuredCollaborativeEditor
└── routes/projects/search.ts         # NEW: POST /projects/:id/search, POST /projects/:id/replace (rate-limited)

apps/web/src/
├── hooks/
│   ├── use-editor-preferences.ts     # EXTEND: LeftPanelTab adds 'search'; isLeftPanelTab + persistence
│   └── use-project-search.ts         # NEW: query state, debounce, AbortController, grouped results, cap display
├── lib/api/project-search.ts         # NEW: searchProjectContent / replaceProjectContent client
├── components/editor/
│   ├── left-panel.tsx                # EXTEND: add searchSlot (always-mounted, hidden when inactive)
│   ├── left-panel-rail.tsx           # EXTEND: append { id:'search', label:'Search', icon: Search } to VIEWS
│   ├── search-view.tsx               # NEW: the Search tab (input + options + grouped results + replace controls)
│   └── project-editor-layout.tsx     # EXTEND: wire searchSlot + activate-on-result navigation
└── lib/codemirror/
    ├── editor-extensions.ts          # EXTEND: keep search({top:true}) behavior; attach token-based panel theme
    └── search-panel-theme.ts         # NEW: design-token CSS for the in-editor find/replace (light/dark)
```

**Structure Decision**: No new package or app. Additive changes across the existing `packages/shared`, `packages/domain`, `packages/infrastructure`, `apps/collab`, `apps/api`, and `apps/web`, following the established rename/refactoring topology. The new domain ports keep RE2 and Hocuspocus out of the domain (dependency rule intact); the structured-apply extends the first-party `apply-edits.ts` rather than forking anything vendored.

**Domain contract ownership** (per `architecture-migration-plan.md`): the search/replace **business contracts are domain-owned types** defined alongside their use cases (like `ReferenceUsage`/`ContentReplacement`); `packages/domain` keeps depending on **only** `@asciidocollab/asciidoc-core` and MUST NOT import `@asciidocollab/shared`. The `packages/shared` `*.dto.ts` are the **HTTP-boundary** shapes; `apps/api/src/routes/projects/search.ts` maps DTO ⇄ domain type. The `RegexEngine` port lives under a new **`ports/text/`** group (a stateless service port), not `ports/storage/`.

## Complexity Tracking

No Constitution violations — table intentionally empty.
