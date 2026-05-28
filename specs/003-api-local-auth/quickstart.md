# Quickstart: API Server + Local Authentication

## Prerequisites

- Node.js 24.x (Active LTS "Krypton")
- pnpm (workspace root) — `pnpm install` at repo root
- PostgreSQL 16+ (running) — or testcontainers for integration tests

## Setup

```bash
# Install dependencies
pnpm install

# Generate Prisma client (includes new Session model)
pnpm --filter=db build

# Build all packages
pnpm build

# Run migrations (dev database)
cd packages/db && npx prisma db push && cd ../..
```

## Running

```bash
# Set required environment variables
export ASCIIDOCOLLAB_AUTH_SESSION_SECRET="your-256-bit-secret-here"
export ASCIIDOCOLLAB_DATABASE_URL="postgresql://localhost:5432/asciidocollab_dev"
export ASCIIDOCOLLAB_AUTH_EMAIL_FROM="noreply@asciidocollab.dev"

# Start the API server
pnpm --filter=api dev
```

The server starts on `http://localhost:4000` by default. Health check at `GET /health`.

## Testing

```bash
# Run all tests
pnpm test

# Run API-specific tests only
pnpm --filter=api test

# Architecture validation
pnpm fresh-onion
```

## Environment Variables

See [data-model.md](data-model.md) for the full list of configurable variables. All security parameters (rate limits, timeouts, password policy) are configurable via environment variables — no hardcoded values (FR-037).

## Architecture

```
Request → Fastify → Route handler → Auth service → Domain use case → Prisma repo → PostgreSQL
            │                                              │
            ├── Session validation                         └── Typed errors → HTTP mapping
            ├── CSRF check
            ├── Rate limit check
            └── Schema validation (FR-016)
```
