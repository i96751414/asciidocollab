# Research: Configuration Strategy

**Feature**: 004-config-strategy
**Date**: 2026-05-28

## Decision 1: Configuration Library

**Decision**: Use `convict` (Mozilla) for configuration management

**Rationale**:
- Mature library (Mozilla, PayPal) with production track record
- Native support for JSON schemas, YAML files, env var overrides
- Built-in format validation (port, hostname, email, URL, regex)
- `sensitive: true` flag for secret redaction in output
- Schema-first approach — single source of truth for config shape
- No custom merging logic required

**Alternatives Considered**:
- **Zod + custom loader**: More control but requires ~100 lines of custom merge logic. Zod is already in the ecosystem but convict solves the exact problem.
- **Extend @fastify/env**: Least flexible, still uses JSON Schema, no YAML support natively.
- **node-config**: Less typed, weaker validation, fewer format options.

## Decision 2: YAML Structure

**Decision**: Nested by category matching env var naming convention

**Rationale**:
- `auth.session.maxAge` in YAML maps to `ASCIIDOCOLLAB_AUTH_SESSION_MAX_AGE` env var
- Categories (auth, api, email) mirror the existing naming convention
- Comments in YAML explain each setting — developer experience improvement
- Secrets are omitted from YAML files entirely

**Alternatives Considered**:
- **Flat with dots**: Less readable for 35+ settings
- **Match env var names**: Verbose, loses the grouping benefit

## Decision 3: Precedence Strategy

**Decision**: Environment variables override YAML values (12-factor)

**Rationale**:
- Standard 12-factor app approach
- YAML provides sensible defaults for development
- Deployment overrides specific values via env vars
- Secrets are always env-var-only (never in YAML)

**Implementation**:
- Convict natively supports this: `env` property on schema fields maps to env var name
- YAML files are loaded first, then env vars override

## Decision 4: Sensitive Field Handling

**Decision**: Mark sensitive fields in schema, redact in output, require in production

**Rationale**:
- `sensitive: true` on convict schema fields redacts values in `convict.toString()`
- `format: 'required-string'` ensures secrets are provided in production
- No secrets in YAML files — only env vars provide secret values
- Redaction applies to logs, error messages, and any config output

## Decision 5: Environment-Specific Configs

**Decision**: Layer YAML files based on NODE_ENV

**Rationale**:
- `default.yaml` provides all non-secret defaults
- `development.yaml`, `production.yaml`, `test.yaml` override per environment
- Convict supports `config.loadFile()` for layered loading
- Fallback to `default.yaml` when NODE_ENV is unset
