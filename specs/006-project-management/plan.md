# Implementation Plan: Project Management

**Branch**: `006-project-management` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-project-management/spec.md`

## Summary

Phase 4 implements project management features including CRUD operations for projects, member management with role-based access control, and a dashboard UI. The feature builds on existing domain use cases (CreateProjectUseCase, InviteUserUseCase, RemoveMemberUseCase, ChangeMemberRoleUseCase, GetProjectTreeUseCase) and adds API routes plus a Next.js dashboard with project list, creation, settings, and member management interfaces.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20+)

**Primary Dependencies**: Next.js 14 (App Router), Fastify, Prisma ORM, Tailwind CSS, Jest + Testing Library + Playwright

**Storage**: PostgreSQL via Prisma ORM (existing schema with Project, ProjectMember, User, AuditLog tables)

**Testing**: Jest + Testing Library (unit/integration), Playwright (E2E), in-memory fakes for domain tests

**Target Platform**: Web browser (Chrome, Firefox, Safari, Edge) + Node.js server (Linux)

**Project Type**: Web application (monorepo with apps/api and apps/web)

**Performance Goals**: Responsive UI with immediate feedback for user actions

**Constraints**: Clean Architecture (domain ← infrastructure ← apps), TDD (red-green-refactor), in-memory fakes for domain testing, session-based auth

**Scale/Scope**: Multi-user collaborative editor, 5 user stories, ~15 functional requirements

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Clean Architecture Compliance

✅ **PASS**: Dependencies flow strictly inward (domain ← infrastructure ← apps)
- Domain layer has zero external dependencies
- Infrastructure implements domain interfaces
- API routes delegate to use cases (no business logic in handlers)
- Next.js frontend calls API routes (no direct domain imports)

### Test-Driven Development

✅ **PASS**: TDD workflow will be followed
- All new use cases will have failing tests first
- Domain tests use in-memory fakes (not mocks)
- Infrastructure tests use testcontainers for real DB
- Commit only after green phase

### Business Logic Placement

✅ **PASS**: Business rules in domain entities and use cases
- Use cases orchestrate domain logic
- Route handlers delegate to use cases
- No business logic in route handlers or controllers

### Contracts & Validation

✅ **PASS**: DTOs in packages/shared
- Fastify schema validation for API inputs
- Zod for frontend form validation
- Result<T, E> for all fallible operations

### Data Access Rules

✅ **PASS**: PostgreSQL via Prisma ORM
- Repository interfaces in domain layer
- Prisma-backed implementations in infrastructure
- In-memory fakes for all repository interfaces

### Blocking Violations (P0)

✅ **PASS**: No P0 violations planned
- Domain will not import from infrastructure
- No business logic in route handlers
- Repository interfaces will be defined in domain
- No cross-package type duplication
- No `any` or `as` casts in production code

## Project Structure

### Documentation (this feature)

```text
specs/006-project-management/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit-tasks)
```

### Source Code (repository root)

```text
asciidocollab/
├── apps/
│   ├── web/              # Next.js 14 — delivery layer
│   │   └── src/
│   │       ├── app/      # App Router pages
│   │       │   ├── (auth)/        # Auth group (login, register)
│   │       │   │   ├── login/
│   │       │   │   └── register/
│   │       │   ├── (dashboard)/   # Dashboard group (protected)
│   │       │   │   ├── layout.tsx # Dashboard layout with sidebar
│   │       │   │   ├── page.tsx   # Project list
│   │       │   │   ├── projects/
│   │       │   │   │   ├── new/           # Create project
│   │       │   │   │   └── [id]/
│   │       │   │   │       ├── page.tsx   # Project overview
│   │       │   │   │       ├── settings/  # Project settings
│   │       │   │   │       └── members/   # Member management
│   │       │   │   └── archived/          # Archived projects
│   │       │   └── layout.tsx     # Root layout
│   │       ├── components/        # Shared UI components
│   │       ├── lib/              # Utilities, API client
│   │       └── styles/           # Global styles, Tailwind config
│   └── api/              # Fastify — delivery layer
│       └── src/
│           ├── routes/
│           │   ├── projects.ts           # Project CRUD routes
│           │   └── projects/
│           │       └── members.ts        # Member management routes
│           └── plugins/                  # Existing auth, CORS, etc.
└── packages/
    ├── domain/            # Business logic (existing use cases)
    │   └── src/
    │       ├── use-cases/
    │       │   ├── create-project.ts     # Existing
    │       │   ├── get-project-tree.ts   # Existing
    │       │   ├── invite-user.ts        # Existing
    │       │   ├── remove-member.ts      # Existing
    │       │   ├── change-member-role.ts # Existing
    │       │   ├── list-user-projects.ts # NEW
    │       │   ├── update-project.ts     # NEW
    │       │   ├── archive-project.ts    # NEW
    │       │   └── restore-project.ts    # NEW
    │       └── entities/
    │           ├── project.ts            # Existing
    │           ├── project-member.ts     # Existing
    │           └── user.ts               # Existing
    ├── infrastructure/    # Prisma repos (existing)
    ├── shared/            # DTOs, Result type (existing)
    └── db/                # Prisma schema (existing)
```

**Structure Decision**: Web application structure (Option 2 from template) with Next.js frontend and Fastify backend in monorepo. Project management adds new routes to API and new pages to web app.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
