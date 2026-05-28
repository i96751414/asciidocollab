---

description: "Task list for Configuration Strategy (004-config-strategy)"
---

# Tasks: Configuration Strategy

**Input**: Design documents from `specs/004-config-strategy/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included per spec.md user story Independent Test criteria.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Config files**: `apps/api/config/`
- **Config source**: `apps/api/src/config/`
- **Tests**: `apps/api/tests/config/`
- **Modified files**: `apps/api/src/routes/*.ts`, `apps/api/src/services/*.ts`, `apps/api/src/plugins/*.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and create config directory structure

- [X] T001 Install `convict` and `yaml` dependencies in `apps/api/package.json`
- [X] T002 Remove `@fastify/env` dependency from `apps/api/package.json`
- [X] T003 Create `apps/api/config/` directory structure

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core config schema and loader that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Create convict schema definition in `apps/api/src/config/schema.ts` with all 45 fields from data-model.md
- [X] T005 Create config loader in `apps/api/src/config/index.ts` — loads YAML, applies env var overrides, exports typed config
- [X] T006 [P] Create `apps/api/config/default.yaml` with all non-secret defaults from data-model.md
- [X] T007 [P] Create `apps/api/config/development.yaml` with dev-specific overrides
- [X] T008 [P] Create `apps/api/config/production.yaml` with production overrides
- [X] T009 [P] Create `apps/api/config/test.yaml` with test overrides

**Checkpoint**: Foundation ready — config schema, loader, and YAML files exist

---

## Phase 3: User Story 1 - Developer Edits Configuration (Priority: P1) 🎯 MVP

**Goal**: Developers can edit YAML files to change application settings

**Independent Test**: Create a YAML file with custom values, start the application, verify settings take effect

### Tests for User Story 1

- [X] T010a [P] [US1] Test YAML loading — create custom YAML, verify values load correctly in `apps/api/tests/config/yaml-loading.test.ts`
- [X] T010b [P] [US1] Test nested category access — verify `app.config.auth.password.minLength` returns YAML value in `apps/api/tests/config/nested-access.test.ts`

### Implementation for User Story 1

- [X] T011 [US1] Replace `apps/api/src/config/env.ts` with new config loader import in `apps/api/src/index.ts`
- [X] T012 [US1] Update `apps/api/src/routes/register.ts` — replace `process.env` with `app.config.*`
- [X] T013 [US1] Update `apps/api/src/routes/login.ts` — replace `process.env` with `app.config.*`
- [X] T014 [US1] Update `apps/api/src/routes/password-change.ts` — replace `process.env` with `app.config.*`
- [X] T015 [US1] Update `apps/api/src/routes/password-reset.ts` — replace `process.env` with `app.config.*`
- [X] T016 [US1] Update `apps/api/src/routes/password-reset-request.ts` — replace `process.env` with `app.config.*`
- [X] T017 [US1] Update `apps/api/src/services/auth.service.ts` — replace `process.env` with `app.config.*`
- [X] T018 [US1] Update `apps/api/src/services/validation.ts` — replace `process.env` with `app.config.*`
- [X] T019 [US1] Update `apps/api/src/plugins/auth.ts` — replace `process.env` with `app.config.*`
- [X] T020 [US1] Update `apps/api/src/plugins/cors.ts` — replace `process.env` with `app.config.*`
- [X] T021 [US1] Update `apps/api/src/plugins/https-redirect.ts` — replace `process.env` with `app.config.*`
- [X] T022 [US1] Update `apps/api/src/services/session-encryption.ts` — replace `process.env` with `app.config.*`
- [X] T023 [US1] Update `apps/api/src/services/breach-check.service.ts` — replace `process.env` with `app.config.*`

**Checkpoint**: All routes and services use typed config, zero `process.env` calls remain

---

## Phase 4: User Story 2 - Environment Variables Override YAML (Priority: P1)

**Goal**: Environment variables override YAML values for deployment flexibility

**Independent Test**: Set a YAML value and an env var for the same setting, verify the env var wins

### Tests for User Story 2

- [X] T024a [P] [US2] Test env var override — set YAML value + env var, verify env var wins in `apps/api/tests/config/env-override.test.ts`

### Implementation for User Story 2

- [X] T025 [US2] Verify env var override behavior — convict handles this natively via `env` property on schema fields
- [X] T026 [US2] Update `apps/api/src/index.ts` — use `app.config.api.port` and `app.config.api.host` for server listen

**Checkpoint**: Env vars correctly override YAML values

---

## Phase 5: User Story 3 - Secrets Stay Out of YAML (Priority: P2)

**Goal**: Secrets are configurable only via environment variables, never in YAML files

**Independent Test**: Verify YAML files contain no secret values and app requires env vars for secret fields

### Tests for User Story 3

- [X] T028a [P] [US3] Test secret redaction — verify `convict.toString()` redacts sensitive fields in `apps/api/tests/config/redaction.test.ts`
- [X] T028b [P] [US3] Test required secrets — verify app fails when `auth.session.secret` is missing in `apps/api/tests/config/required-secrets.test.ts`

### Implementation for User Story 3

- [X] T029 [US3] Mark sensitive fields in schema: `auth.session.secret`, `auth.session.encryptionKey`, `auth.email.smtpPassword`, `auth.email.sendgridApiKey`
- [X] T030 [US3] Ensure sensitive fields have no default values in YAML files

**Checkpoint**: Secrets never appear in YAML files, logs, or error messages

---

## Phase 6: User Story 4 - Environment-Specific Configs (Priority: P2)

**Goal**: Separate YAML files for development, staging, and production

**Independent Test**: Create environment-specific YAML files and verify correct one loads based on NODE_ENV

### Tests for User Story 4

- [X] T031a [P] [US4] Test env-specific loading — set NODE_ENV=development, verify dev.yaml overrides default in `apps/api/tests/config/env-specific.test.ts`
- [X] T031b [P] [US4] Test fallback — unset NODE_ENV, verify default.yaml loads in `apps/api/tests/config/env-fallback.test.ts`

### Implementation for User Story 4

- [X] T032 [US4] Update config loader to load `apps/api/config/{NODE_ENV}.yaml` based on NODE_ENV
- [X] T033 [US4] Ensure fallback to `apps/api/config/default.yaml` when NODE_ENV is unset
- [X] T034 [US4] Verify layered loading: default.yaml → {NODE_ENV}.yaml → env vars

**Checkpoint**: Environment-specific configs load correctly with proper precedence

---

## Phase 7: User Story 5 - Config Validation on Startup (Priority: P2)

**Goal**: Application validates all configuration values on startup

**Independent Test**: Provide invalid config values and verify app fails fast with clear error messages

### Tests for User Story 5

- [X] T035a [P] [US5] Test type mismatch — set `api.port: "not-a-number"`, verify validation error in `apps/api/tests/config/validation.test.ts`
- [X] T035b [P] [US5] Test out-of-range — set `api.port: 99999`, verify validation error in `apps/api/tests/config/validation.test.ts`
- [X] T035c [P] [US5] Test missing required field — omit `auth.session.secret`, verify clear error message in `apps/api/tests/config/validation.test.ts`

### Implementation for User Story 5

- [X] T036 [US5] Verify convict validation catches type mismatches (e.g., string for integer field)
- [X] T037 [US5] Verify convict validation catches missing required fields
- [X] T038 [US5] Verify convict validation catches out-of-range values (e.g., port > 65535)

**Checkpoint**: Config validation fails fast with clear error messages

---

## Phase 8: New Config Fields (From Clarification)

**Purpose**: Add newly identified config fields that were hard-coded

### Implementation for New Fields

- [X] T039 [P] Add `api.frontendUrl` field to schema in `apps/api/src/config/schema.ts`
- [X] T040 [P] Add `api.httpsRedirect` field to schema in `apps/api/src/config/schema.ts`
- [X] T041 [P] Add `auth.breachCheck.hibpApiUrl` field to schema in `apps/api/src/config/schema.ts`
- [X] T042 [P] Add `auth.session.cookie` fields (httpOnly, sameSite, saveUninitialized, rolling) to schema
- [X] T043 [P] Add `auth.passwordReset.tokenByteLength` field to schema
- [X] T044 [P] Add email template fields (subjects + HTML bodies) to schema
- [X] T045 Update `apps/api/src/services/breach-check.service.ts` to use `app.config.auth.breachCheck.hibpApiUrl`
- [X] T046 Update `apps/api/src/routes/password-reset-request.ts` to use `app.config.api.frontendUrl`
- [X] T047 Update `apps/api/src/plugins/https-redirect.ts` to use `app.config.api.httpsRedirect`
- [X] T048 Update `apps/api/src/plugins/auth.ts` to use `app.config.auth.session.cookie.*`
- [X] T049 Update `apps/api/src/services/password-reset.service.ts` to use `app.config.auth.passwordReset.tokenByteLength`
- [X] T050 Update email sending calls to use `app.config.auth.email.templates.*`
- [X] T051 Update `apps/api/config/default.yaml` with new field defaults
- [X] T052 Update `apps/api/config/development.yaml` with new field dev values

**Checkpoint**: All hard-coded values are now configurable

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, tests, and quality gates

- [X] T053 Run `pnpm typecheck` — verify zero type errors
- [X] T054 Run `pnpm lint` — verify zero lint errors
- [X] T055 Run `pnpm --filter=domain test` — verify all domain tests pass
- [X] T056 Run `pnpm fresh-onion` — verify architecture boundaries intact
- [X] T057 Verify zero `process.env` calls remain in `apps/api/src/` production code

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — core config loading
- **US2 (Phase 4)**: Depends on Foundational — env var override is built into convict
- **US3 (Phase 5)**: Depends on Foundational — sensitive field marking
- **US4 (Phase 6)**: Depends on Foundational — YAML file loading
- **US5 (Phase 7)**: Depends on Foundational — validation is built into convict
- **New Fields (Phase 8)**: Depends on Foundational — schema additions
- **Polish (Phase 9)**: Depends on all previous phases

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — no dependencies on other stories
- **US2 (P1)**: Can start after Foundational — env var override is built-in
- **US3 (P2)**: Can start after Foundational — independent of US1/US2
- **US4 (P2)**: Can start after Foundational — independent of US1/US2/US3
- **US5 (P2)**: Can start after Foundational — validation is built-in

### Parallel Opportunities

- All Setup tasks [P] can run in parallel
- All Foundational YAML file tasks [P] can run in parallel
- US1 route updates [P] can run in parallel (different files)
- New field schema additions [P] can run in parallel
- US3, US4, US5 can run in parallel after Foundational

---

## Parallel Examples

### Phase 2 (Foundational)

```bash
Task: "Create apps/api/config/default.yaml"
Task: "Create apps/api/config/development.yaml"
Task: "Create apps/api/config/production.yaml"
Task: "Create apps/api/config/test.yaml"
```

### Phase 3 (US1 Route Updates)

```bash
Task: "Update apps/api/src/routes/register.ts"
Task: "Update apps/api/src/routes/login.ts"
Task: "Update apps/api/src/routes/password-change.ts"
Task: "Update apps/api/src/routes/password-reset.ts"
Task: "Update apps/api/src/routes/password-reset-request.ts"
```

### Phase 8 (New Fields)

```bash
Task: "Add api.frontendUrl to schema"
Task: "Add api.httpsRedirect to schema"
Task: "Add auth.breachCheck.hibpApiUrl to schema"
Task: "Add auth.session.cookie fields to schema"
Task: "Add auth.passwordReset.tokenByteLength to schema"
Task: "Add email template fields to schema"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1 (YAML editing)
4. Complete Phase 4: US2 (env var overrides — mostly built-in)
5. **STOP and VALIDATE**: Config loads from YAML, env vars override
6. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 + US2 → Config loads from YAML with env overrides (MVP!)
3. Add US3 → Secrets handled correctly
4. Add US4 → Environment-specific configs
5. Add US5 → Validation on startup
6. Add Phase 8 → New configurable fields
7. Polish → Quality gates pass

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All existing `ASCIIDOCOLLAB_*` env var names preserved for backward compatibility
