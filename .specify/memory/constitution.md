<!--
SYNC IMPACT REPORT
==================
Version change: 2.5.0 → 2.6.0 (MINOR — six new principles added (X–XV) governing the in-browser
rendering & export capability introduced by feature 039, plus a Governance addition making the two
new NON-NEGOTIABLE principles (X client-side/no-egress, XI reference-build parity) non-waivable by a
plan. No existing principle removed or redefined. Principle X (outbound egress) and Principle XIV
(sandbox-safe dependency runtime) cross-reference the existing Principle IX (Untrusted Input Boundary,
which governs inbound content) rather than duplicating it; Principles XI/XII/XV extend the existing
verification discipline (Principle II + End-of-Feature Verification) with reference-parity comparison
testing.)

Added principles (2.6.0):
- X. Client-Side by Default — No Source Egress Without Consent (NON-NEGOTIABLE)
- XI. Reference-Build Parity — The Fidelity Oracle (NON-NEGOTIABLE)
- XII. Deterministic, Reproducible Output
- XIII. Non-Blocking Responsiveness
- XIV. Sandbox-Safe Dependencies Only
- XV. Fidelity Verified Before Done

Added sections (2.6.0):
- Governance › Non-Waivable Principles (new subsection)

Removed / redefined principles (2.6.0): none.

Templates requiring updates (2.6.0):
- ✅ .specify/templates/plan-template.md — Constitution Check is generic ("[Gates determined based on
  constitution file]"); it auto-reflects X–XV. No change required.
- ✅ .specify/templates/tasks-template.md — task categorization is constitution-generic; no
  principle-driven task type added or removed. No change required.
- ✅ .specify/templates/spec-template.md — no constitution-coupled mandatory section changed. No
  change required.
- ✅ .specify/memory/architecture_constitution.md — no conflict with new principles.
- ✅ .specify/memory/security_constitution.md — no conflict; Principles X/XIV align with its
  sandbox/allow-list posture.

Follow-up TODOs (2.6.0): none. Ratification date retained from original adoption.

--- prior change (2.4.0 → 2.5.0) retained for context ---
MINOR — End-of-Feature Verification's full quality-gate sweep now includes a security scan step: the
`security` gate (scripts/ci/security.sh — Semgrep SAST, zizmor, gitleaks, OSV-Scanner gated at High+,
plus a non-gating knip report), mirroring the CI `security` job. See the aligned
security_constitution.md 1.2.0 which adds the SAST and secret/workflow-scanning patterns. No principle
removed or redefined.

--- prior change (2.3.0 → 2.4.0) retained for context ---
MINOR — two new subsections added to Development Workflow:
"Implementation Discipline" mandates /tdd skill for every implementation task and forbids
splitting test/implementation into separate tasks; "End-of-Feature Verification" mandates a
full quality-gate sweep (lint, typecheck, unit + integration + e2e tests across all touched
packages) and a /code-review loop (repeat until zero findings) before a feature is done.)

--- prior change (2.2.0 → 2.3.0) retained for context ---
MINOR — Principle II clarified: performance/load tests are opt-in, not added unless explicitly
requested. No principle removed or redefined; functional TDD unchanged.

--- prior change (2.1.0 → 2.2.0) retained for context ---
MINOR — one new principle added (IX); Principle VIII materially expanded; Principles IV and VII
clarified. Rationale: feature 026 (AsciiDoc editor enhancements) was being scoped DOWN to avoid
Principle VIII, and IV/VII were ambiguous for (a) extending the in-repo Lezer grammar and (b)
project-shared configuration — UNBLOCKED while STRENGTHENING the security boundary.

Modified principles (2.4.0): none — existing principles unchanged.

Added sections (2.4.0):
- Development Workflow › Implementation Discipline (new subsection)
- Development Workflow › End-of-Feature Verification (new subsection)

Removed sections: none

Templates requiring updates:
- ✅ .specify/templates/tasks-template.md — removed separate "Tests for User Story" sub-sections;
  tasks now describe WHAT, not HOW (the /tdd skill owns the how). Updated Notes section.
- ✅ .specify/templates/plan-template.md — Constitution Check is generic; no changes required.
- ✅ .specify/templates/spec-template.md — no constitution-coupled mandatory sections changed.
- ✅ .specify/memory/architecture_constitution.md — no conflict.
- ✅ .specify/memory/security_constitution.md — no conflict.

Follow-up TODOs: none. Ratification date retained from original adoption.
-->
# AsciiDoCollab Constitution — Governance

## Core Principles

### I. Clean Code — Readable, Maintainable, Honest

Code MUST be written for humans first, machines second.

- Names MUST reveal intent: classes are nouns, methods are verbs, booleans read as
  predicates.
- Functions MUST be small and do one thing. A function that cannot be explained in a
  single sentence is too large.
- Comments MUST explain "why", never "what". Code structure MUST make "what"
  self-evident.
- DRY is a guideline, not a dogma. Duplication is acceptable when abstraction would
  introduce the wrong coupling.
- Every operation that can fail MUST have an explicit error path. Domain errors are
  typed value objects, not strings or generic `Error`.
- No magic numbers, no magic strings. Constants MUST be named and live close to their
  usage.
- Side effects MUST be explicit and isolated from pure logic.

---

### II. Test-Driven Development — Red-Green-Refactor (NON-NEGOTIABLE)

No production code MAY be written without a corresponding failing test first.

- **Red:** Write a test that defines the desired behaviour. Run it. Confirm it fails.
- **Green:** Write the minimal production code to make the test pass. No more.
- **Refactor:** Improve the code while keeping tests green.
- The cycle applies to: entities, value objects, use cases, repository contracts, API
  routes, frontend components, and collaboration logic.
- Domain use cases MUST be tested with **in-memory fakes** of repository interfaces —
  not mocks, not stubs. This keeps tests fast, honest, and decoupled from infrastructure.
- Infrastructure adapters MUST use integration tests against real dependencies (database
  via testcontainers, filesystem via temp directories).
- **Performance, load, and benchmark tests are OPT-IN.** This TDD mandate covers *functional*
  correctness only. Performance/load/benchmark tests (and the latency/throughput targets they assert)
  MUST NOT be added unless the feature specification explicitly requests them. Their absence is never a
  coverage gap and MUST NOT be raised as one (e.g. by `/speckit-analyze`). When a spec does request
  them, they follow the same red-green discipline as functional tests.
- A test that never failed is not a valid test.
- Commit only after Green phase. Never commit with failing tests.

---

### III. Seam Testing with In-Memory Fakes

Repository interfaces defined in `domain` MUST be testable via in-memory implementations.

- Every repository interface MUST have a corresponding in-memory fake in the test suite.
- In-memory fakes MUST live in the test tree (not production code) and MUST behave like
  the real implementation: same constraints, same error conditions, same ordering
  guarantees.
- Mocking libraries (jest.mock, sinon, etc.) MUST NOT be used to simulate repository
  behaviour. They MAY be used for IO boundaries (e.g., HTTP calls, filesystem) where
  fakes are impractical.
- Integration tests against real infrastructure (Prisma + PostgreSQL, Docker, filesystem)
  are complementary to unit tests with in-memory fakes, not a replacement for them.

---

### IV. Reuse Before Rebuild

Well-licensed open-source assets MUST be preferred over re-deriving equivalent work by hand.

- Before authoring a stylesheet, parser, algorithm, or similar asset that a maintained
  open-source project already provides under a compatible license, that source MUST be
  reused.
- Third-party files MUST be vendored **verbatim**, with their original license header and
  attribution preserved. Hand-editing a vendored file is prohibited.
- Vendored assets MUST remain **re-syncable**: record the upstream source and version/commit,
  and apply local adaptations (e.g., scoping, generation) via a documented, repeatable build
  step rather than in-place edits.
- "Reuse" presupposes a **compatible** asset. Where no maintained asset exists in a form compatible
  with the target runtime and license (e.g. no Lezer/CodeMirror-compatible grammar exists to vendor),
  **extending an existing in-repo asset** is preferred over re-deriving from scratch, PROVIDED the
  decision and the absence of a vendorable-compatible equivalent are documented in the plan's research.
  This is not a license to hand-fork a vendored file — it applies to assets the project already owns.
- Rationale: re-deriving existing work invites drift, bugs, and licensing risk; verbatim
  vendoring keeps fidelity and makes upstream updates a mechanical re-sync. But "reuse" must not be
  weaponized to block extending a first-party asset when nothing compatible exists to vendor.

---

### V. Theming via Design Tokens

Application UI styling MUST flow through the design-token system and work in both light and
dark modes.

- App chrome (toolbars, panels, menus, dialogs, and other framework UI) MUST derive colors
  from design tokens — never hardcoded color literals.
- Every themed surface MUST be legible and correct in both light and dark mode.
- A deliberately mode-independent surface (e.g., a rendered-document style that is light-only
  by design) is permitted ONLY when explicitly specified, and MUST be confined per Principle
  VI so it does not affect token-driven chrome.
- Rationale: tokenized theming guarantees consistent, mode-correct UI and prevents one-off
  color literals from breaking dark mode.

---

### VI. Style Isolation

Rendered-document (preview/output) styles MUST be scoped to their content surface and MUST
NOT leak into application chrome.

- Document-rendering stylesheets MUST be confined to the preview content container (via
  build-time selector scoping, Shadow DOM, or equivalent). Global selectors from such
  stylesheets MUST be neutralized so they cannot restyle the surrounding application.
- Changing or selecting a document-rendering style MUST produce zero visible change to
  application chrome outside the content surface.
- Rationale: rendered content uses third-party global styles; without isolation they would
  override the token-driven app UI and corrupt the interface.

---

### VII. Per-User Preferences, Shared Content Immutability

User preferences MUST be scoped to the individual user and MUST NOT mutate shared content.

- A preference is owned by and persisted against a single user; it MUST NOT be stored on, or
  derived from, a shared document or project.
- Applying or changing a preference MUST NOT alter shared document source or change what any
  other user sees in their own view.
- One user's preference MUST NOT affect a concurrent collaborator's rendering of the same
  document.
- This principle governs **personal preferences**. **Project-scoped configuration** — owned by a
  project, governed by that project's edit permissions, and intentionally shared across the project's
  collaborators (e.g. a designated main/master document that roots cross-file resolution) — is NOT a
  user preference and is permitted. Such configuration MUST be stored on the project (not as a per-user
  preference), MUST be permission-gated, and MUST NOT silently rewrite document source.
- Rationale: conflating personal preference with shared state breaks collaboration guarantees
  and silently corrupts documents; conversely, legitimate project configuration must not be mistaken
  for a forbidden mutation of shared content.

---

### VIII. Editor Pipeline Integrity (Sanitization & Scroll-Sync)

Features MUST NOT regress the editor's content-sanitization or scroll-synchronization
behavior.

- Preview content sanitization MUST remain intact and unchanged for all rendering paths; new
  features MUST NOT widen what is rendered without an explicit, reviewed security decision.
- **Assembling or resolving additional content into a rendering path IS permitted** — e.g. expanding
  `include::` directives so the preview renders the configured main document, embedding a source
  language's highlighting, or rendering imported markup. Such a feature MUST NOT be scoped away merely
  to avoid this principle. The permission is conditional: the assembled/resolved content MUST pass
  **unchanged through the existing sanitizer** (the same boundary, re-applied to more inputs — never a
  relaxed or bypassed one) and MUST satisfy **Principle IX** (sandbox confinement + validation). The
  sanitizer MUST NOT be weakened, widened, or forked to accommodate new content.
- Scroll-synchronization behavior MUST be preserved; changes that touch the sync seam MUST be
  covered by tests proving no regression.
- Any change that necessarily affects either path MUST be called out in the plan's
  Constitution Check and justified, including the security argument for any newly-resolved content.
- Rationale: sanitization is a security boundary and scroll-sync is a core UX guarantee;
  silent regressions in either are high-cost and hard to detect. The boundary exists to be *enforced
  on all inputs*, not to forbid features — so features may add inputs, but never escape the boundary.

---

### IX. Untrusted Input Boundary (NON-NEGOTIABLE)

All externally-sourced content entering the editor or the render pipeline MUST be validated,
sandbox-confined, and sanitized before it is inserted into a document or rendered.

- "Externally-sourced content" includes, at minimum: pasted or dropped clipboard data (HTML, images,
  files), content pulled in by `include::` resolution, embedded source-language content, and any path
  produced by attribute substitution or user input.
- **Sandbox confinement:** file/path resolution (includes, images, link targets) MUST resolve only
  within the owning project's storage sandbox. Path traversal (`..`, absolute paths, symlink escape)
  and remote/external fetches (URLs, network includes, SSRF vectors) MUST be rejected unless an
  explicit, reviewed allow-list decision is recorded.
- **Sanitization:** imported markup (e.g. pasted HTML converted to AsciiDoc, or resolved content fed to
  the preview) MUST be sanitized through the project's existing sanitizer before insertion/rendering;
  no feature MAY introduce a parallel or relaxed sanitization path.
- **Validation:** uploaded/dropped binary content MUST be validated (type, size) at the boundary;
  embedding a source language for highlighting MUST treat the embedded text as **inert data** (it is
  never executed or evaluated).
- **No silent bypass:** any feature that needs an exception MUST record it in the plan's Constitution
  Check with a security justification and reference the `security_constitution.md`.
- Rationale: every feature in this spec that "unblocks" richer content (paste-HTML, image paste/drop,
  cross-file include resolution, attribute-substituted paths, embedded languages) is also a potential
  injection or SSRF vector. Centralizing the rule as a NON-NEGOTIABLE boundary lets features grow
  without each one re-litigating security — they inherit one enforced gate.

---

### X. Client-Side by Default — No Source Egress Without Consent (NON-NEGOTIABLE)

Project files and document content MUST be processed in the browser; content leaving the client is
the exception, never the default.

- Rendering, export, include resolution, and asset processing MUST run client-side. The document
  source and included files MUST NOT be transmitted to a server for rendering.
- No document content MAY leave the client EXCEPT a resource the user explicitly referenced (e.g. a
  remote `include::` or image URL the author wrote), and even then ONLY after **explicit user
  consent**, via an **allowlisted** path. A silent or implicit outbound fetch of referenced content
  is a violation.
- Absence of consent MUST fail closed: the referenced remote resource is skipped with a clear,
  localized warning, and the rest of the document still renders/exports.
- This principle governs **outbound** content (what leaves the client). It is the egress counterpart
  to Principle IX (Untrusted Input Boundary), which governs **inbound** content; the "explicit,
  reviewed allow-list decision" required for a remote fetch in Principle IX is the SAME gate this
  principle requires for egress — they MUST NOT be satisfied by two divergent mechanisms.
- Rationale: content is frequently confidential (e.g. GB smart-metering specifications); privacy is
  the default, not a setting a user must discover and enable.

---

### XI. Reference-Build Parity — The Fidelity Oracle (NON-NEGOTIABLE)

In-app rendering/export output MUST match the canonical Asciidoctor PDF toolchain (the project's
CLI / Maven build) for the same inputs.

- The reference build is the single source of truth for appearance. Where in-app output and the
  reference build diverge for the same inputs, **the reference build is correct** and the divergence
  is a defect to be fixed — not a new baseline to adopt.
- Parity MUST be **verified against reference output**, never assumed from code inspection or from
  the in-app result looking plausible.
- The fidelity bar is **element-level style parity** (fonts, spacing, colors, and layout of each
  rendered block match the reference), unless a feature spec states a stricter bar.
- Rationale: the same documents are also produced by a server/Maven pipeline; there can be only one
  source of truth for appearance, and teams already rely on the reference formatting.

---

### XII. Deterministic, Reproducible Output

Identical inputs MUST produce identical output.

- Output MUST be **byte-stable**, or where byte-stability is impractical, **visually stable within a
  defined, documented tolerance** used consistently by parity tests.
- Generated/derived assets (rasterized diagrams, subsetted fonts, cached intermediates) MUST be
  **content-addressed** so identical inputs resolve to the same asset.
- Output MUST NOT depend on wall-clock time, network timing, ambient machine state, locale, or
  iteration/order nondeterminism. Any unavoidable non-determinism MUST be normalized before it
  reaches the output.
- Rationale: reproducibility is the precondition for both parity testing (Principle XI) and safe
  caching; non-deterministic output makes "does it match the reference?" unanswerable.

---

### XIII. Non-Blocking Responsiveness

Rendering and export MUST NOT freeze the editor.

- Heavy work (parsing, rendering, export, rasterization) MUST run **off the main thread**. The main
  thread MUST remain free to service user input at all times.
- Live preview MUST remain interactive **during** rendering; updates MAY be coalesced/debounced but
  MUST NOT block typing, selection, or navigation.
- This complements Principle VIII (Editor Pipeline Integrity): the scroll-sync and sanitization seams
  MUST continue to hold while rendering runs concurrently.
- Rationale: this is a live editing surface, not a batch tool; a render that stalls the editor breaks
  the core interaction the product exists to provide.

---

### XIV. Sandbox-Safe Dependencies Only

Runtime rendering dependencies MUST run inside the browser sandbox.

- Runtime rendering code MUST NOT spawn subprocesses, open sockets, or load native OS extensions
  (including native extensions in any embedded Ruby/Asciidoctor layer).
- Capabilities that would otherwise require a host OS (filesystem, fonts, time, environment) MUST be
  provided by **explicit browser-side shims** with defined, auditable behavior — never by assuming a
  host OS is present or reachable.
- This is the runtime-dependency counterpart to Principle IX's sandbox confinement: IX confines
  resolved *paths/content*; this principle confines the *execution environment* of the rendering
  dependencies themselves. Neither may be relaxed to accommodate a dependency's convenience.
- Rationale: the browser/WASI sandbox is the security and portability boundary; a dependency that
  escapes it forfeits both guarantees and cannot ship.

---

### XV. Fidelity Verified Before Done

Fidelity-critical behavior MUST be covered by comparison tests against reference output before it is
considered complete.

- Fidelity-critical behavior includes, at minimum: theme application, fonts (embedding, subsetting,
  fallback), diagrams, mathematical notation, citations/bibliography, and include resolution
  (including tag/line/leveloffset filters).
- "Comparison test" means an automated check of in-app output against the reference-build output
  (Principle XI) at the defined tolerance (Principle XII) — not a snapshot of the in-app output
  against itself.
- A fidelity-critical deliverable with no passing comparison test against reference output is **not
  done**, and MUST NOT be marked complete or merged. This extends the End-of-Feature Verification
  gate for rendering/export features.
- Rationale: parity claims (Principle XI) require evidence; without a comparison test, "it matches"
  is an assertion, not a fact.

---

## Architecture & Security References

- Architecture enforcement rules are defined in `.specify/memory/architecture_constitution.md`
- Security requirements are defined in `.specify/memory/security_constitution.md`

---

## Development Workflow & Quality Gates

### Phased Delivery

Development MUST follow the phased delivery plan defined in the architecture spec:

1. Each phase MUST produce independently runnable and testable software.
2. No phase MAY depend on a later phase. Forward dependencies are prohibited.
3. A phase is complete only when all its tests pass, lint is clean, and type checking
   succeeds.

### Commit Discipline

- Commits MUST be granular: one logical change per commit.
- Commit messages MUST follow Conventional Commits format:
  `type(scope): description`. Examples: `feat(domain): add Project entity`,
  `fix(api): correct session TTL calculation`.
- A commit MUST NOT contain both production code changes and test changes for different
  concerns. Test changes for the same feature MAY be in the same commit as the
  implementation.
- No commit MAY contain failing tests. If a test fails, the entire change is reverted.

### Implementation Discipline

Every implementation task MUST be executed via the `/tdd` skill. The skill owns the
red-green-refactor cycle — test authoring, implementation order, and commit timing are
managed within the skill, not specified outside it.

- Tasks MUST describe **what** to implement. The `/tdd` skill determines **how** (failing
  test first, minimal production code second, refactor third). Task descriptions MUST NOT
  prescribe test file names, assert implementation steps, or pre-split test and source work.
- Tasks MUST NOT be split into a "write test" sub-task and a "write implementation"
  sub-task for the same deliverable. One deliverable = one task = one `/tdd` invocation.
  Splitting breaks the red-green feedback loop and risks out-of-order execution.
- Bypassing the `/tdd` skill and writing production code directly is a Principle II
  violation. The only permitted exception is a task that is explicitly non-functional
  (e.g., file rename, config-only change, documentation update with no logic).
- Rationale: externalizing test/implementation sequencing into the task list re-creates the
  "tests optional" anti-pattern under a different name. Delegating the cycle to a single
  skill invocation makes compliance structural, not advisory.

### Quality Gates (Pre-Commit)

Before every commit, the following MUST pass:

1. `pnpm lint` — zero warnings in the affected package(s).
2. `pnpm typecheck` — zero type errors.
3. Relevant unit tests — all green.
4. No secrets, credentials, or internal file paths in the diff.

### End-of-Feature Verification

When all tasks for a feature are complete, the following MUST run before the feature is
considered done and a PR is opened:

1. **Full quality-gate sweep** — across every package touched by the feature:
   - `pnpm lint` — zero warnings.
   - `pnpm typecheck` — zero type errors.
   - All unit tests — full suite, all green.
   - All integration tests — full suite, all green.
   - **Security scan** — the `security` gate (`scripts/ci/security.sh`: Semgrep SAST,
     zizmor, gitleaks, OSV-Scanner gated at High+, plus a non-gating knip report), zero
     blocking findings. This runs as part of `pnpm gate` and mirrors the CI `security` job.
   - All e2e tests — full suite, all green.
2. **Code review loop** — the `/code-review` skill MUST be invoked. If it surfaces any
   findings, each finding MUST be fixed and the skill MUST be re-invoked. This loop
   continues until `/code-review` returns zero findings. The feature MUST NOT be merged
   before the loop reaches a clean pass.

Both steps are NON-NEGOTIABLE. A feature that completes all tasks but skips either step is
not done.

### Code Review

- Every PR MUST validate constitution compliance.
- Complexity must be justified in the PR description.
- Architectural decisions affecting cross-package contracts require review from at least
  one team member familiar with both the domain and infrastructure layers.

---

## Governance

This Constitution supersedes all other development practices, guidelines, and conventions
referenced in the repository. In case of conflict between this Constitution and any other
document (including CLAUDE.md, AGENTS.md, or template files), this Constitution prevails.

### Non-Waivable Principles

The NON-NEGOTIABLE principles — II (TDD), IX (Untrusted Input Boundary), X (Client-Side by Default —
No Source Egress Without Consent), and XI (Reference-Build Parity) — CANNOT be waived by a plan,
task, or PR. In particular:

- A plan MUST NOT trade away Principle X or XI to simplify implementation. Any tension with them
  (e.g. a document referencing a remote resource the browser cannot fetch directly) MUST be resolved
  **in favor of the principle** — via explicit user consent plus an allowlisted path (Principle X) or
  by treating the reference build as correct (Principle XI) — NOT by carving out an exception.
- The Complexity Tracking / justification mechanism (used elsewhere to document intentional
  deviations) does NOT apply to these principles: they admit no justified violation, only a compliant
  design.

### Amendment Procedure

1. **Proposal:** An amendment is proposed as a PR that modifies this document.
2. **Review:** The PR MUST include:
    - The rationale for the change.
    - The impact on each phase of the delivery plan.
    - A migration plan for existing code that violates the new rule (if applicable).
3. **Approval:** Two team members MUST approve. If the amendment removes or redefines a
   NON-NEGOTIABLE principle, unanimous consent is required.
4. **Version bump:** The `CONSTITUTION_VERSION` MUST be bumped according to semantic
   versioning (see below).

### Versioning Policy

- **MAJOR:** Backward-incompatible governance changes — principle removal, redefinition
  of a NON-NEGOTIABLE principle, or architectural constraint change.
- **MINOR:** New principle or section added, or materially expanded guidance on an
  existing principle.
- **PATCH:** Clarifications, wording refinements, typo fixes, non-semantic improvements.

### Compliance Review

- Every `plan.md` MUST include a **Constitution Check** section documenting how the plan
  satisfies (or justifies deviation from) each applicable principle.
- Every feature PR MUST reference the Constitution Check from the plan.
- Violations detected during review MUST be resolved before merge. If a violation is
  intentional and justified, it MUST be documented in the PR description and the plan's
  complexity tracking section.

**Version**: 2.6.0 | **Ratified**: 2026-05-27 | **Last Amended**: 2026-07-11
