# Quickstart: Monorepo Scaffold & Domain Layer

## Prerequisites

- Node.js 24.x (Active LTS "Krypton")
- pnpm 9+

## Setup

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run linting
pnpm lint

# Type check
pnpm typecheck

# Validate architectural boundaries
pnpm fresh-onion
```

## Package Structure

| Package | Path | Purpose |
|---------|------|---------|
| domain | `packages/domain` | Entities, VOs, repos, use cases, errors — zero deps |
| shared | `packages/shared` | DTOs, shared types, Result type |

## Development

```bash
# Build a specific package
pnpm build --filter=domain

# Test a specific package
pnpm test --filter=domain

# Watch mode
pnpm test --filter=domain -- --watch
```

## Key Decisions

- **No DI framework**: Domain uses plain constructor injection. Composition root
  in future `apps/` packages will wire dependencies.
- **In-memory fakes**: All repository interfaces have corresponding fakes in
  `packages/domain/tests/repositories/`. No mocking libraries for repositories.
- **fresh-onion**: Run `pnpm fresh-onion` to validate layer boundaries.
  Configured in `onion.config.json`. Registered as a root script.
- **Code coverage**: 90% threshold for all packages except domain (exempted).
