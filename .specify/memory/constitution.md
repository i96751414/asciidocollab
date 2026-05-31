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

### Quality Gates (Pre-Commit)

Before every commit, the following MUST pass:

1. `pnpm lint` — zero warnings in the affected package(s).
2. `pnpm typecheck` — zero type errors.
3. Relevant unit tests — all green.
4. No secrets, credentials, or internal file paths in the diff.

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

**Version**: 2.0.0 | **Ratified**: 2026-05-27 | **Last Amended**: 2026-05-28
