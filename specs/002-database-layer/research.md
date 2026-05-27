# Research: Database Layer

**Date**: 2026-05-27
**Phase**: Phase 0 — Technology Research

## Overview

No NEEDS CLARIFICATION markers exist in the spec — all technology decisions are established by the architecture design doc and the Phase 1 codebase. This document consolidates the known decisions and confirms they apply to Phase 2.

---

## Decisions

### 1. ORM: Prisma (Confirmed)

**Decision**: Prisma with PostgreSQL provider
**Rationale**: Already established in architecture design doc and constitution. Strong TypeScript integration, type-safe queries, migration management.
**Alternatives considered**: TypeORM (less active development, more complex API), Drizzle (newer, less ecosystem maturity), Kysely (query builder only, no schema/migration tooling)

### 2. Test Framework: Jest + testcontainers (Confirmed)

**Decision**: Jest with ts-jest for test runner, testcontainers for PostgreSQL provisioning
**Rationale**: Jest is already configured in the monorepo root. testcontainers provides disposable PostgreSQL instances per test suite with proper cleanup.
**Alternatives considered**: pg-mem (in-memory Postgres — doesn't match production behavior exactly), raw Dockerode (more verbose, no lifecycle management)

### 3. Database: PostgreSQL 16 (Confirmed)

**Decision**: PostgreSQL 16 via testcontainers `postgres:16-alpine` for testing
**Rationale**: Matches production target. Alpine image keeps container overhead minimal.
**Alternatives considered**: PostgreSQL 15 (older, no material advantage), CockroachDB (different consistency model, overkill for this phase)

### 4. Package Split: db + infrastructure (Confirmed)

**Decision**: Separate `packages/db` (schema + client) and `packages/infrastructure` (implementations)
**Rationale**: Clean separation of concerns — schema is independent of implementations. `packages/db` can have zero monorepo imports. `infrastructure` imports domain + db.
**Alternatives considered**: Single `packages/infrastructure` with schema embedded (tighter coupling), schema in `packages/domain` (violates clean architecture)

### 5. PrismaClient Re-export Pattern (New)

**Decision**: `packages/db/src/index.ts` re-exports `PrismaClient` type and instance factory
**Rationale**: Infrastructure should not depend on Prisma internals or raw `@prisma/client` paths. The `packages/db` package provides the canonical import path.
**Alternatives considered**: Each repository creates its own PrismaClient (duplication, hard to swap), PrismaClient passed via DI at composition root (still needs type import)

### 6. Mapping Pattern: toDomain / toPersistence (New)

**Decision**: Each repository implements private `toDomain(record: PrismaType): DomainEntity` and `toPersistence(entity: DomainEntity): PrismaCreateInput` methods
**Rationale**: Explicit mapping without a mapping library. Matches Phase 1 conventions (no external deps). Easy to test and debug.
**Alternatives considered**: Automapper library (adds dependency, config complexity), class-transformer (decorator-based, violates zero-dep domain rule)

### 7. Enum Mapping (New)

**Decision**: Prisma enum strings convert to domain value objects via `.create()` and back via `.value`
**Rationale**: Domain value objects already validate on construction. This is consistent with how the in-memory fakes work.
**Alternatives considered**: Direct string passthrough (bypasses domain validation), numeric enums (less readable)

### 8. Native PostgreSQL UUID Type (New)

**Decision**: All UUID columns (ID PKs and FKs) use `@db.Uuid` for native PostgreSQL `uuid` type instead of plain `String` (which defaults to `text`)
**Rationale**: Native UUID is more compact (16 bytes fixed vs. variable text), indexes more efficiently, and uses less storage. No client-side type changes needed — PrismaClient still exposes UUIDs as JavaScript `string`.
**Alternatives considered**: Plain `String` without `@db.Uuid` (defaults to `text` — more storage, slower indexing), `cuid()`/`@default(cuid())` (non-UUID format, less standard)
