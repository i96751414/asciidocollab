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
