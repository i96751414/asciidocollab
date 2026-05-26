<!--
  Sync Impact Report
  ==================
  Version change: 0.0.0 → 1.0.0 (initial creation — template was unfilled)
  Modified principles: N/A (first constitution)
  Added sections: Core Principles (I–VI), Security & Infrastructure Constraints,
    Development Workflow & Quality Gates, Governance
  Removed sections: N/A
  Templates requiring updates:
    ✅ .specify/templates/plan-template.md — Constitution Check section is generic; no changes needed
    ✅ .specify/templates/spec-template.md — Template is generic; no changes needed
    ✅ .specify/templates/tasks-template.md — Test-first language already aligns with TDD principle
    ⚠ .specify/templates/constitution-template.md — Parent template; not updated by this process
  Follow-up TODOs: None
-->

# AsciiDocCollab Constitution

## Core Principles

### I. Clean Architecture — Strict Dependency Rule

Dependencies flow strictly inward:
Domain ← Application ← Infrastructure ← Delivery.

- `packages/domain` MUST have zero external dependencies — no Prisma, no Fastify, no
  filesystem, no framework imports of any kind.
- `packages/infrastructure` implements domain interfaces; domain MUST never import
  infrastructure.
- All cross-boundary communication MUST use DTOs defined in `packages/shared`.
- Dependency injection MUST wire concrete implementations to domain interfaces at the
  composition root in `apps/` — no service locators, no static singletons.
- The domain layer MUST define repository interfaces; infrastructure provides
  implementations.
- Use cases in the domain layer MUST orchestrate business logic without knowing the
  delivery mechanism (HTTP, WebSocket, CLI, etc.).

**Rationale:** Clean Architecture is the foundational constraint of this project. The
architecture spec and monorepo structure are built around it. Violating the dependency
rule increases coupling, reduces testability, and undermines the phased delivery strategy.

---

### II. Clean Code — Readable, Maintainable, Honest

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

**Rationale:** This is a long-lived, multi-phase project with evolving team composition.
Clean Code discipline ensures that code written in Phase 1 remains comprehensible and
changeable through Phase 15.

---

### III. Test-Driven Development — Red-Green-Refactor (NON-NEGOTIABLE)

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

**Rationale:** The architecture spec explicitly calls for domain use cases tested with
in-memory fakes. TDD is the only disciplined way to ensure this happens consistently
across all 15 phases. This principle is NON-NEGOTIABLE — no exceptions without a
documented governance amendment.

---

### IV. Type Safety — Leverage the Type System

TypeScript MUST be used to its full potential across the entire monorepo.

- `strict: true` in every `tsconfig.json`. No project MAY disable strict mode.
- `Result<T, E>` (discriminated union) MUST be used for all fallible operations in the
  domain and application layers. Exceptions are reserved for truly exceptional conditions
  (e.g., out of memory, infrastructure crashes).
- The `any` type is forbidden in production code. `unknown` MUST be used when the type
  is not known, with explicit type narrowing before use.
- Prisma's generated types MUST be used for database access — raw SQL or untyped queries
  are not permitted without documented justification.
- `packages/shared` MUST define all DTOs, shared error types, and interfaces that cross
  package boundaries. No two packages MAY independently define the same type.
- `as` casts are forbidden. Use type guards or Zod validation for narrowing.

**Rationale:** With 5+ packages in a pnpm monorepo, type safety is the primary mechanism
for preventing cross-package integration bugs. The collaboration server (Hocuspocus), API
server (Fastify), and frontend (Next.js) share domain concepts — types are the contract.

---

### V. Security by Design — Never an Afterthought

Security constraints MUST be modelled in the domain layer and enforced at every boundary.

- **RBAC in the domain:** Permission checks MUST live in use cases, not in route
  handlers. Routes call use cases; use cases enforce authorization. No route MAY
  duplicate a permission check that the domain already performs.
- **Sandboxed Git operations:** Each git operation MUST spawn a short-lived Docker
  container (FR-011). The container mounts only the requesting project's directory.
- **Credential handling:** Secrets (API tokens, SSH keys, TOTP secrets) MUST be
  encrypted at rest with AES-256. They MUST never be logged, committed, or written to
  disk unencrypted.
- **Input validation:** All external input MUST be validated at the boundary (Fastify
  schema validation for API, Zod for frontend forms). The domain layer MUST not trust
  its inputs.
- **Typed errors prevent information leaks:** Domain error types MUST NOT expose
  internal state (stack traces, DB IDs, file paths) to the client. Fastify's error
  handler maps domain errors to safe HTTP responses.
- **Dependency scanning:** All runtime dependencies MUST be scanned for known
  vulnerabilities as part of the CI pipeline.

**Rationale:** AsciiDocCollab is designed for enterprise deployment with SSO, MFA, and
multi-tenant projects. Security cannot be retrofitted — it must be engineered into the
architecture from Phase 1.

---

### VI. Seam Testing with In-Memory Fakes

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

**Rationale:** In-memory fakes are explicitly specified in the architecture. They provide
faster, more reliable tests than mocks, and they serve as a living specification of the
repository contract. When the contract changes, the fake must change — catching
integration issues at compile time rather than at runtime.

---

## Security & Infrastructure Constraints

### Technology Mandates

| Constraint | Rule | Enforcement |
|---|---|---|
| Database | PostgreSQL via Prisma ORM | Prisma schema in `packages/db`; all queries via generated client |
| Monorepo tooling | pnpm workspaces | `pnpm-workspace.yaml` defines the workspace |
| Code editor | CodeMirror 6 | Only CodeMirror 6 + y-codemirror.next for collaborative editing |
| Real-time CRDT | Yjs | All collaborative text editing via Yjs `Y.Text`; Hocuspocus for server |
| PDF generation | Asciidoctor-PDF (Ruby sidecar) | Ruby container spawned per-render; no JS-based PDF fallback |
| API framework | Fastify | Schema-first validation for all routes |
| Frontend framework | Next.js 14 (App Router) | Dashboard/auth via SSR; editor as client component |
| Component library | shadcn/ui + Radix UI + Tailwind CSS | Design tokens as CSS custom properties; light/dark themes |
| Test runner | Jest + Testing Library (unit/integration) | Jest for all Node.js tests; Playwright for E2E |
| Domain testing | In-memory fakes | Every domain repository has an in-memory fake in the test suite |
| Infrastructure testing | testcontainers | Integration tests spin up real PostgreSQL/Docker containers |

### Deployment Constraints

- **Dual deployment:** The same codebase MUST support both self-hosted and SaaS models.
  Environment configuration (secrets, feature flags, provider URLs) drives the
  difference.
- **Git isolation:** Docker sandbox containers MUST be used for all git operations. No
  git commands execute on the host machine or share process state between projects.
- **Session storage:** Server-side sessions MUST use PostgreSQL (via `connect-pg-simple`).
  In-memory or filesystem session stores are not permitted.
- **Encryption in transit:** TLS MUST be terminated at the load balancer / reverse proxy.
  Internal service-to-service communication (Fastify ↔ Hocuspocus) MAY use plain HTTP
  within the Docker network.
- **Project creation invariant:** Every project creation MUST run a single DB transaction:
  insert Project → insert root FileNode → update Project.rootFolderId. Every project MUST
  always have a root folder.

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

**Version**: 1.0.0 | **Ratified**: 2026-05-26 | **Last Amended**: 2026-05-26
