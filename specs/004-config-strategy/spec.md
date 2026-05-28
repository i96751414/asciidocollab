# Feature Specification: Configuration Strategy

**Feature Branch**: `004-config-strategy`

**Created**: 2026-05-28

**Status**: Draft

**Input**: User description: "Configuration strategy for the application using YAML files and environment variables, with developer experience as primary goal"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer Edits Configuration (Priority: P1)

As a developer, I want to edit a readable YAML file to change application settings (rate limits, timeouts, feature flags) so that I can configure the application without parsing 30+ environment variables.

**Why this priority**: This is the core value proposition — making configuration readable and editable. Without this, the feature delivers no value.

**Independent Test**: Can be fully tested by creating a YAML file with custom values, starting the application, and verifying the settings take effect.

**Acceptance Scenarios**:

1. **Given** a YAML file with `auth.password.minLength: 8`, **When** the application starts, **Then** the password minimum length is 8
2. **Given** a YAML file with commented sections explaining each setting, **When** a developer opens the file, **Then** they can understand what each setting controls without reading documentation
3. **Given** a YAML file with nested categories (auth, api, email), **When** a developer wants to change rate limits, **Then** they find the setting under the logical category

---

### User Story 2 - Environment Variables Override YAML (Priority: P1)

As a DevOps engineer, I want environment variables to override YAML values so that I can deploy the same code to different environments without modifying files.

**Why this priority**: Essential for 12-factor deployment. Without env var overrides, YAML-only config cannot work across environments.

**Independent Test**: Can be tested by setting a YAML value and an env var for the same setting, then verifying the env var wins.

**Acceptance Scenarios**:

1. **Given** YAML sets `api.port: 4000` and env var `ASCIIDOCOLLAB_API_PORT=8080`, **When** the application starts, **Then** it listens on port 8080
2. **Given** YAML sets `auth.session.maxAge: 1800000` and env var `ASCIIDOCOLLAB_AUTH_SESSION_MAX_AGE=3600000`, **When** the application starts, **Then** session timeout is 3600000ms
3. **Given** no env var is set for a setting, **When** the application starts, **Then** the YAML value is used

---

### User Story 3 - Secrets Stay Out of YAML (Priority: P2)

As a security engineer, I want secrets (session keys, API keys, passwords) to be configurable only via environment variables so that they never appear in version-controlled YAML files.

**Why this priority**: Security-critical but doesn't block basic functionality. Developers can still use the system without this, but production deployments require it.

**Independent Test**: Can be tested by verifying that YAML files contain no secret values and that the application requires env vars for secret fields.

**Acceptance Scenarios**:

1. **Given** a YAML file without `auth.session.secret`, **When** the application starts in production mode, **Then** it fails with a clear error message
2. **Given** a YAML file with `auth.session.secret: dev-secret`, **When** the application logs config, **Then** the secret value is redacted
3. **Given** env var `ASCIIDOCOLLAB_AUTH_SESSION_SECRET=my-secret`, **When** the application starts, **Then** the secret is loaded from the env var

---

### User Story 4 - Environment-Specific Configs (Priority: P2)

As a developer, I want separate YAML files for development, staging, and production so that each environment has appropriate defaults without env var clutter.

**Why this priority**: Improves developer experience but not required for basic config loading.

**Independent Test**: Can be tested by creating environment-specific YAML files and verifying the correct one is loaded based on NODE_ENV.

**Acceptance Scenarios**:

1. **Given** `config/development.yaml` with `api.port: 3000` and `config/production.yaml` with `api.port: 4000`, **When** NODE_ENV=development, **Then** the app uses port 3000
2. **Given** NODE_ENV is not set, **When** the application starts, **Then** it loads `config/default.yaml`
3. **Given** a setting in `config/production.yaml` overrides `config/default.yaml`, **When** NODE_ENV=production, **Then** the production value is used

---

### User Story 5 - Config Validation on Startup (Priority: P2)

As a developer, I want the application to validate all configuration values on startup so that I catch errors immediately rather than at runtime.

**Why this priority**: Prevents runtime failures from misconfiguration. Important for reliability.

**Independent Test**: Can be tested by providing invalid config values and verifying the application fails fast with clear error messages.

**Acceptance Scenarios**:

1. **Given** YAML with `api.port: "not-a-number"`, **When** the application starts, **Then** it fails with a clear validation error
2. **Given** YAML with `api.port: 99999`, **When** the application starts, **Then** it fails because the port is out of range
3. **Given** a required field is missing and no default exists, **When** the application starts, **Then** it fails with a message indicating which field is missing

---

### Edge Cases

- What happens when the YAML file is malformed (invalid YAML syntax)?
- What happens when the YAML file does not exist?
- What happens when an env var has a different type than the schema expects (e.g., "abc" for an integer field)?
- What happens when two environment-specific YAML files define conflicting values for the same setting?
- What happens when a secret field has a default value in the schema?

## Clarifications

### Session 2026-05-28

- Q: Should the configuration system include additional hard-coded values as configurable fields (frontendUrl, httpsRedirect, hibpApiUrl, cookie settings, token byte length)? → A: All of them
- Q: Should email subjects and HTML templates be configurable? → A: Config fields
- Q: Should CORS methods and allowed headers be configurable? → A: Hard-coded (standard REST patterns)
- Q: Should security parameters (login delay, crypto algorithms, key lengths) be configurable? → A: Hard-coded (best practices)
- Q: Should password reset token expiry remain as planned? → A: Already covered as auth.passwordReset.tokenExpiry

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST load configuration from YAML files with nested category structure
- **FR-002**: System MUST allow environment variables to override any YAML value
- **FR-003**: System MUST validate all configuration values against a schema on startup
- **FR-004**: System MUST provide type-safe access to configuration values (no `as` casts or `parseInt` in application code)
- **FR-005**: System MUST support environment-specific YAML files (default.yaml, development.yaml, production.yaml, test.yaml)
- **FR-006**: System MUST mark sensitive fields (secrets, API keys) and redact them in logs and output
- **FR-007**: System MUST fail fast with clear error messages when required configuration is missing or invalid
- **FR-008**: System MUST support all current and newly identified configuration fields (40+ settings across api, auth, email, session categories)
- **FR-009**: System MUST maintain backward compatibility with existing environment variable names
- **FR-010**: System MUST NOT store secrets in YAML files — secret fields MUST be env-var-only in production
- **FR-011**: System MUST include `api.frontendUrl` for password reset link base URL (default: 'https://asciidocollab.example.com')
- **FR-012**: System MUST include `api.httpsRedirect` to enable/disable HTTPS redirect
- **FR-013**: System MUST include `auth.breachCheck.hibpApiUrl` for HIBP API endpoint (default: 'https://api.pwnedpasswords.com/range')
- **FR-014**: System MUST include `auth.session.cookie` settings: `httpOnly` (default: true), `sameSite` (default: 'lax'), `saveUninitialized` (default: false), `rolling` (default: true)
- **FR-015**: System MUST include `auth.passwordReset.tokenByteLength` for token generation (default: 32)
- **FR-016**: System MUST include configurable email templates: subjects and HTML bodies for password reset, password change, and breach alert notifications
- **FR-017**: Security parameters (login delay, crypto algorithms, key lengths) MUST remain hard-coded as they follow best practices

### Key Entities

- **Configuration Schema**: Defines all valid configuration fields, their types, defaults, formats, and env var mappings
- **Configuration Source**: YAML file or environment variable providing configuration values
- **Sensitive Field**: A configuration field containing secrets that must be redacted in output
- **Environment Profile**: A named configuration layer (development, production, test) that overrides defaults
- **Email Template**: Configurable email subject and HTML body for transactional notifications

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can change any non-secret application setting by editing a single YAML file
- **SC-002**: Zero `process.env` or `parseInt` calls in application code — all config access goes through the typed config object
- **SC-003**: Application fails within 100ms of startup if required configuration is missing
- **SC-004**: All 40+ current and newly identified configuration settings are migrated to the new system without breaking existing behavior
- **SC-005**: Secrets never appear in YAML files, logs, or error messages
- **SC-006**: Email templates are customizable via config without code changes

## Assumptions

- Existing environment variable names (`ASCIIDOCOLLAB_*`) are preserved for backward compatibility
- The API server is the only consumer of this configuration system (domain/infrastructure packages remain config-free)
- YAML files are stored in `apps/api/config/` and loaded relative to the application root
- The `NODE_ENV` environment variable determines which environment-specific YAML file to load
- Configuration is loaded once at application startup and is immutable thereafter
- Current `@fastify/env` dependency will be replaced by the new configuration library
