# Quickstart: Database Layer

**Date**: 2026-05-27

## Prerequisites

- Node.js 24.x
- pnpm (latest)
- Docker (for testcontainers-based integration tests)
- PostgreSQL 16+ (optional — testcontainers provides disposable instances)

## Setup

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build
```

This will:

1. Install dependencies for `packages/db` (Prisma) and `packages/infrastructure`
2. Generate the Prisma client from the schema
3. Build all TypeScript to `dist/`

## Development Workflow

### Generate Prisma Client

```bash
pnpm -F db prisma generate
```

### Run Prisma Migrations (for local development)

```bash
cd packages/db
DATABASE_URL="postgresql://localhost:5432/asciidocollab" npx prisma migrate dev
```

### Run Tests

```bash
# All tests
pnpm test

# Infrastructure package only
pnpm -F infrastructure test

# Domain package only (unchanged)
pnpm -F domain test
```

Integration tests use testcontainers — they spin up a temporary PostgreSQL instance automatically. No local database
setup needed.

### Type Check

```bash
pnpm typecheck
```

### Lint

```bash
pnpm lint
```

### Architecture Validation

```bash
pnpm fresh-onion
```

## Package Scripts

### packages/db

| Script            | Description                                 |
|-------------------|---------------------------------------------|
| `build`           | Generate Prisma client + compile TypeScript |
| `prisma generate` | Regenerate Prisma client from schema        |
| `prisma migrate`  | Create/run database migrations              |

### packages/infrastructure

| Script  | Description                                                 |
|---------|-------------------------------------------------------------|
| `build` | Compile TypeScript                                          |
| `test`  | Run Jest test suite (integration tests with testcontainers) |

## Key Files

| File                                                  | Purpose                                        |
|-------------------------------------------------------|------------------------------------------------|
| `packages/db/prisma/schema.prisma`                    | Database schema definitions for all 9 entities |
| `packages/db/src/index.ts`                            | Re-exports PrismaClient types                  |
| `packages/infrastructure/src/persistence/*.ts`        | Prisma repository implementations              |
| `packages/infrastructure/tests/persistence/*.test.ts` | Integration tests                              |

## Architecture Rules

- `packages/db` imports nothing from the monorepo
- `packages/infrastructure` may import `domain`, `shared`, `db`
- `packages/domain` never imports `infrastructure` or `db`
- All repository interfaces are defined in `packages/domain`
- PrismaClient is injected into repositories via constructor (DI-ready)
