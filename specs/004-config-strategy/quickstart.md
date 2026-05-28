# Quickstart: Configuration Strategy

**Feature**: 004-config-strategy
**Date**: 2026-05-28

## Prerequisites

- Node.js 24.x
- pnpm (monorepo package manager)

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Required Environment Variables

For development, create a `.env` file in `apps/api/`:

```bash
# Required secrets (never commit these)
ASCIIDOCOLLAB_AUTH_SESSION_SECRET=dev-session-secret
ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY=dev-encryption-key-32-chars-long!

# Optional: override defaults
ASCIIDOCOLLAB_API_PORT=4000
```

### 3. Run the Application

```bash
pnpm --filter=@asciidocollab/api dev
```

The application loads configuration in this order:
1. `apps/api/config/default.yaml` — base defaults
2. `apps/api/config/development.yaml` — dev overrides (when NODE_ENV=development)
3. Environment variables — highest priority overrides

### 4. Edit Configuration

Open `apps/api/config/default.yaml` to change settings:

```yaml
api:
  port: 4000
  host: 0.0.0.0

auth:
  session:
    maxAge: 1800000    # 30 minutes
  password:
    minLength: 12
    requireUppercase: true
```

### 5. Environment-Specific Overrides

For production, either:
- Set `NODE_ENV=production` and edit `apps/api/config/production.yaml`
- Or override via environment variables:

```bash
ASCIIDOCOLLAB_API_PORT=8080
ASCIIDOCOLLAB_AUTH_SESSION_MAX_AGE=3600000
```

## Configuration Access

```typescript
// In route handlers
const port = app.config.api.port;

// In services (via DI)
const maxAge = config.auth.session.maxAge;
```

## Testing Configuration

```bash
# Run config-specific tests
pnpm --filter=@asciidocollab/api test -- --testPathPattern=config
```
