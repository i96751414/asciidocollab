For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan at
specs/001-domain-layer-scaffold/plan.md

## Build & Test Commands

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Run domain-specific tests
pnpm --filter=domain test

# Run tests with coverage
pnpm test:coverage

# Type-check
pnpm typecheck

# Lint
pnpm lint

# Validate architecture boundaries
pnpm fresh-onion
```

## Phase 1 Implementation Summary

Phase 1 (Monorepo scaffold + domain layer) is **complete and merged to master**.

### What was built

- **9 entities**: User, Project, ProjectMember, FileNode, Document, Image, Template, GitRepository, AuditLog
- **19 value objects**: Uuid (base), 9 ID subclasses, Email, FilePath, Role, ProjectName, GitProvider, MimeType, FileNodeType, ContentId, YjsStateId, TemplateCategory, Timestamps
- **7 use cases**: create-project, rename-file, delete-file, invite-user, remove-member, change-member-role, get-project-tree
- **16 error classes**: DomainError (base), ProjectNotFoundError, UserNotFoundError, FileNodeNotFoundError, PermissionDeniedError, DuplicateEmailError, InvalidProjectNameError, FileConflictError, ProjectMemberAlreadyExistsError, CannotRemoveOwnerError, CannotChangeOwnerRoleError, CannotRemoveLastAdminError, CannotAttachDocumentToFolderError, CannotDeleteRootFolderError, MemberNotFoundError, ValidationError
- **9 repository interfaces** with in-memory fakes
- **Shared package**: Result<T,E> discriminated union + 7 DTOs
- **164 tests** across 18 test suites

### Code conventions established

- **Zero runtime deps in domain** — enforced by fresh-onion
- **Value objects** — `static create()` + private constructor, throw `ValidationError` on bad input
- **UUID IDs** — extend `Uuid` abstract base, cross-type `equals()` via `instanceof` + constructor check
- **Timestamps** — `Timestamps` value object with defensive `Date` copies, used by User, Project, FileNode, Document
- **ID naming** — all ID params/fields use `Id` suffix (`actorId`, `fileNodeId`, `projectId`)
- **Use cases** — return `Result<T, DomainError>`, never throw
- **Entity invariants** — validated in constructor, errors thrown (programmer errors, not control flow)
- **In-memory fakes** — all 9 repos tested with Map-backed fakes, no mocking libraries
- **Architecture** — fresh-onion validates domain never imports outside its package

### Key design decisions

- `CreateProjectUseCase` does NOT verify actor exists — API layer responsibility
- `FileNode.move()` creates new node (immutable) — old node replaced in storage
- Recursive folder deletion uses iterative DFS with explicit stack — no stack overflow risk
- Actor validation for admin-only operations uses `callerMembership.role.value !== 'administrator'` check
- Owner cannot be removed, owner's role cannot be changed, last admin cannot be removed/demoted
- `docs/superpowers/specs/2026-05-26-asciidocollab-architecture-design.md` has the full architecture spec
