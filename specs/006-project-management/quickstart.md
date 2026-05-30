# Quickstart: Project Management

**Date**: 2026-05-29
**Feature**: Phase 4 - Project Management

## Prerequisites

- Node.js 20+
- pnpm 8+
- PostgreSQL 16+ (or Docker for testcontainers)
- Git

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up Database

```bash
# Start PostgreSQL (if not using Docker)
# Or use Docker:
docker run -d --name asciidocollab-db \
  -e POSTGRES_USER=asciidocollab \
  -e POSTGRES_PASSWORD=asciidocollab \
  -e POSTGRES_DB=asciidocollab \
  -p 5432:5432 \
  postgres:16-alpine

# Run migrations
cd packages/db
pnpm prisma migrate dev
```

### 3. Configure Environment

```bash
# Copy example env file
cp apps/api/.env.example apps/api/.env

# Edit apps/api/.env with your database URL
ASCIIDOCOLLAB_DATABASE_URL=postgresql://asciidocollab:asciidocollab@localhost:5432/asciidocollab
```

### 4. Start Development Servers

```bash
# Terminal 1: API server
cd apps/api
pnpm dev

# Terminal 2: Web app
cd apps/web
pnpm dev
```

### 5. Access the Application

- **Web App**: http://localhost:3000
- **API**: http://localhost:3001

## Development Workflow

### Running Tests

```bash
# Run all tests
pnpm test

# Run domain tests only
pnpm test --filter=domain

# Run API tests only
pnpm test --filter=api

# Run web tests only
pnpm test --filter=web

# Run with coverage
pnpm test:coverage
```

### Type Checking

```bash
pnpm typecheck
```

### Linting

```bash
pnpm lint
```

### Architecture Validation

```bash
pnpm fresh-onion
```

## API Testing

### Using curl

```bash
# Login first
curl -c cookies.txt -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# List projects
curl -b cookies.txt http://localhost:3001/api/projects

# Create project
curl -b cookies.txt -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"My Project","description":"A test project","tags":["test"]}'
```

### Using Playwright (E2E)

```bash
# Run E2E tests
cd apps/web
pnpm test:e2e

# Open Playwright UI
pnpm test:e2e --ui
```

## Project Structure

### Adding New API Routes

1. Create route file in `apps/api/src/routes/`
2. Define Fastify schema for validation
3. Implement route handler that delegates to domain use case
4. Register route in `apps/api/src/index.ts`

### Adding New Web Pages

1. Create page in `apps/web/src/app/` using App Router conventions
2. Use Server Components for data fetching
3. Use Client Components for interactivity
4. Add components to `apps/web/src/components/`

### Adding New Use Cases

1. Create use case in `packages/domain/src/use-cases/`
2. Return `Result<T, DomainError>` from `execute()` method
3. Add in-memory fake in `packages/domain/tests/repositories/`
4. Write tests with in-memory fakes

## Common Tasks

### Add New Project Field

1. Update Prisma schema in `packages/db/prisma/schema.prisma`
2. Run `pnpm prisma migrate dev`
3. Update domain entity in `packages/domain/src/entities/project.ts`
4. Update repository interface and implementation
5. Update DTOs in `packages/shared`

### Add New Member Role

1. Update `Role` value object in `packages/domain/src/value-objects/role.ts`
2. Update Prisma enum if needed
3. Update role permission checks in use cases
4. Update API validation schemas

### Add New Audit Action

1. Add action constant to domain layer
2. Create audit log entry in relevant use case
3. Update audit log query if needed

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker ps | grep asciidocollab-db

# Check connection
psql postgresql://asciidocollab:asciidocollab@localhost:5432/asciidocollab
```

### Type Errors

```bash
# Regenerate Prisma client
cd packages/db
pnpm prisma generate

# Check types
pnpm typecheck
```

### Test Failures

```bash
# Run specific test file
pnpm test -- path/to/test.test.ts

# Run with verbose output
pnpm test -- --verbose
```
