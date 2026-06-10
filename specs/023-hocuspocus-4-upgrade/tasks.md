---
description: "Task list for Hocuspocus 4 upgrade"
---

# Tasks: Hocuspocus 4 Upgrade

**Input**: Design documents from `specs/023-hocuspocus-4-upgrade/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/collaboration-contract.md, quickstart.md

**Tests**: INCLUDED. The Constitution (II — TDD, NON-NEGOTIABLE) and plan require the one behavioral change (auth-hook header access) to be driven test-first, and the existing collaboration suite + Playwright e2e are the behavior-parity acceptance baseline.

**Module format**: `apps/collab` converts CommonJS → **native ESM** (maintainer direction). `apps/web` is already ESM (Next.js).

**Organization**: Grouped by user story. This is a cohesive dependency upgrade — the three stories share one underlying change and are verified through different lenses (live collaboration / current-stack + gates / data continuity) rather than shipped as separable slices.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 (Setup, Foundational, Polish carry no story label)

## Path Conventions

Tests live under each app's `tests/` tree mirroring `src/` (e.g. `apps/collab/tests/extensions/auth-hook.test.ts` ↔ `apps/collab/src/extensions/auth-hook.ts`).

---

## Phase 1: Setup (dependency bumps)

**Purpose**: Move the two Hocuspocus packages to v4; confirm the rest of the stack stays put.

- [X] T001 [P] Bump `@hocuspocus/server` from `^2.15.3` to `^4.1.1` in `apps/collab/package.json`.
- [X] T002 [P] Bump `@hocuspocus/provider` from `^2.15.3` to `^4.1.1` in `apps/web/package.json`.
- [X] T003 Run `pnpm install` and confirm resolution: `pnpm why @hocuspocus/server @hocuspocus/provider` → `4.1.1`; `pnpm why yjs` → single `13.6.31`; `y-protocols`/`y-codemirror.next` unchanged. Do NOT bump `yjs`, `y-protocols`, or `y-codemirror.next` (already latest + v4-compatible per research.md R1).

**Checkpoint**: Dependencies resolved; nothing compiles yet.

---

## Phase 2: Foundational (ESM conversion + v4 migration — must compile & pass unit tests before parity can be verified)

**⚠️ CRITICAL**: No user-story verification can begin until `apps/collab` is ESM, both apps compile on v4, and unit tests are green.

### ESM conversion of `apps/collab` (research.md R2)

- [X] T004 Set `"type": "module"` in `apps/collab/package.json` and make the `test` script run jest with `--experimental-vm-modules` (e.g. `NODE_OPTIONS=--experimental-vm-modules jest`).
- [X] T005 In `apps/collab/tsconfig.json` set `module: "NodeNext"` and `moduleResolution: "NodeNext"` (keep `target: ES2022`); confirm `apps/collab/tsconfig.eslint.json` (used by ts-jest) inherits an ESM-compatible `module`.
- [X] T006 Convert `apps/collab/jest.config.cjs` to ts-jest ESM: `extensionsToTreatAsEsm: ['.ts']`, `transform` with `useESM: true`, and `moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' }` so `.js` specifiers resolve to `.ts` in tests.
- [X] T007 Add explicit `.js` extensions to ALL relative imports across `apps/collab/src/**` (e.g. `./composition-root` → `./composition-root.js`, `../server` → `../server.js`) as required by NodeNext.
- [X] T008 In `apps/collab/src/extensions/persistence.ts` replace `const Y = createRequire(__filename)('yjs')` with `import * as Y from 'yjs'`; remove the `node:module` import and any other CJS globals (`__filename`/`__dirname`/`require`) repo-wide in `apps/collab/src` (use `import.meta.url` + `fileURLToPath` only if a path is genuinely needed).

### Auth-hook header migration (security boundary, test-first)

- [X] T009 (RED) In `apps/collab/tests/extensions/auth-hook.test.ts`, change the mocked `requestHeaders` from a plain object to a web `Headers` instance (e.g. `new Headers({ origin, cookie })`); run the test and confirm it FAILS against the current `['origin']`/`['cookie']` access.
- [X] T010 (GREEN) Update `apps/collab/src/extensions/auth-hook.ts`: `requestHeaders.origin ?? requestHeaders.Origin` → `requestHeaders.get('origin')`; `requestHeaders.cookie ?? requestHeaders.Cookie` → `requestHeaders.get('cookie')`; re-run the test → green. Accept/deny + `readOnly` behavior MUST be identical (contract §3).

### Update remaining mocked Hocuspocus payloads to v4 shapes

- [X] T011 [P] Update mocked headers/payloads to web `Headers` (and any `tsc`-surfaced field renames) in `apps/collab/tests/extensions/origin-check.test.ts`.
- [X] T012 [P] Update mocked headers/payloads to web `Headers` in `apps/collab/tests/extensions/connection-limit.test.ts`.
- [X] T013 [P] Update mocked `onConnect`/`onDisconnect`/`beforeHandleMessage` payloads to v4 shapes in `apps/collab/tests/server.test.ts` and `apps/collab/tests/server-payload.test.ts`.

### Server source v4 + compile + run

- [X] T014 Confirm no source reads removed v4 fields (`request.socket.remoteAddress`) in `apps/collab/src/extensions/auth-hook.ts`, `connection-limit.ts`, `audit-log-denial.ts`; verify `apps/collab/src/server.ts` typechecks against v4 hook types (`onConnectPayload`, `onDisconnectPayload`, `beforeHandleMessagePayload`, `Extension`), keeping `Server.configure({...})`. Adapt any renamed field internally with no behavior change.
- [X] T015 Run `pnpm --filter @asciidocollab/collab run typecheck`; resolve ESM/NodeNext issues (missing `.js` extensions, CJS→ESM interop with workspace packages `@asciidocollab/domain|infrastructure|db|shared` — if a named import fails interop, import the default and destructure).
- [X] T016 Run `pnpm --filter @asciidocollab/collab run build`, then boot-smoke the ESM output (`node dist/index.js` starts, or `node --input-type=module -e "await import('./dist/index.js')"`), confirming Hocuspocus 4's ESM build and the workspace packages load at runtime.

### Web provider compile

- [X] T017 Verify `apps/web/src/hooks/use-collab-document.ts` `HocuspocusProvider({...})` options typecheck against provider v4; adapt any renamed option internally (no behavior change). Update the provider mock in `apps/web/tests/hooks/use-collab-document.test.tsx` if its shape changed.
- [X] T018 Run `pnpm --filter @asciidocollab/web run typecheck` and `pnpm --filter @asciidocollab/web run build`; confirm green.

**Checkpoint**: `apps/collab` is ESM, both apps compile on Hocuspocus 4, all unit tests green. User-story verification can begin.

---

## Phase 3: User Story 1 - Collaboration keeps working (Priority: P1) 🎯 MVP

**Goal**: Real-time co-editing, presence, persistence, edit lock, reconnection, and offline fallback behave identically on v4.

**Independent Test**: Two clients co-edit a document live (changes + presence sync), reconnection resyncs, and the offline fallback triggers — no user-visible change.

- [X] T019 [US1] Run the collab server unit suite `pnpm --filter @asciidocollab/collab exec jest` (ESM mode); all green (server config, auth-hook, connection-limit, origin-check, persistence, watchdog, index, config).
- [X] T020 [P] [US1] Run the web collaboration unit tests: `apps/web/tests/hooks/use-collab-document.test.tsx`, `use-collab-presence.test.tsx`, `apps/web/tests/components/editor/{collab-undo,editor-collab-extensions,collab-presence-bar,preview-collab}.test.tsx`, `apps/web/tests/lib/api/collab.test.ts`, `apps/web/tests/app/(dashboard)/projects/[id]/project-editor-layout-collab.test.tsx`; all green.
- [X] T020a [P] [US1] Constitution VIII guard — run the editor-pipeline regression tests for preview sanitization and scroll-sync: `apps/web/tests/hooks/use-asciidoc-preview.test.tsx` (DOMPurify sanitization + scroll-to-line); confirm no regression from the collaboration-stack change.
- [X] T021 [US1] Run the Playwright collaboration e2e against a live v4 server+client: `apps/web/e2e/collab-editing.spec.ts`, `collab-awareness.spec.ts`, `collab-late-join.spec.ts`, `collab-observer.spec.ts`, `collab-undo.spec.ts` (via `./scripts/e2e-local.sh` or the collab subset); all green.
- [ ] T022 [US1] Manual smoke (spec P1): two browser sessions co-edit live with presence; drop one client's network → reconnect resyncs + role re-checked, no lost edits; stop the collab server → document opens read-only with the offline notice.

**Checkpoint**: Collaboration verified at parity on v4 (MVP).

---

## Phase 4: User Story 2 - Run on the current, supported stack (Priority: P2)

**Goal**: The project runs on Hocuspocus v4 (collab now ESM) with a single Yjs version and all quality gates green.

**Independent Test**: Dependency tree shows Hocuspocus 4.1.1 + one Yjs 13.6.31; build and all gates pass with no high+ vulnerabilities.

- [X] T023 [US2] Confirm resolved versions in the lockfile: Hocuspocus `4.1.1` (server + provider), exactly one `yjs@13.6.31` (no duplicate instances) — SC-004/SC-005.
- [X] T024 [US2] Run the full static gates from repo root: `npx eslint .`, `pnpm run typecheck`, `pnpm run fresh-onion`, `pnpm -r build` — all green.
- [X] T025 [P] [US2] Run `pnpm --filter @asciidocollab/collab exec jest --coverage`; meets 90/90/90/90 (keep the updated auth-hook branch covered).
- [X] T026 [P] [US2] Run `pnpm --filter @asciidocollab/web exec jest --coverage`; meets 90/90/90/90.
- [X] T027 [US2] Run `pnpm audit --audit-level=high`; no vulnerabilities at or above the enforced severity (FR-011/SC-006).

**Checkpoint**: On v4 (ESM collab), single Yjs, all gates green.

---

## Phase 5: User Story 3 - Existing documents remain usable (Priority: P3)

**Goal**: Documents created before the upgrade load, display, and persist edits afterward — zero data loss.

**Independent Test**: A pre-upgrade document opens with prior content, accepts edits, and the edits persist on reopen.

- [X] T028 [US3] Confirm persistence parity: `apps/collab/tests/extensions/persistence.test.ts` green (Yjs state load/store unchanged; single `yjs` instance after the ESM import change).
- [X] T029 [US3] Run `apps/web/e2e/collab-persistence-handoff.spec.ts` (write-back + reopen across a session boundary); green.
- [ ] T030 [US3] Manual continuity check (spec P3): open a document that existed before the upgrade → prior content intact; edit, close the room, reopen → edits persisted. No data-format migration was performed (data-model.md).

**Checkpoint**: Pre-upgrade documents verified intact on v4.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T031 Commit the updated `pnpm-lock.yaml` with the dependency changes.
- [ ] T032 [P] Verify mutation testing still runs under ESM: `pnpm --filter @asciidocollab/collab run mutate` (adjust the Stryker config for ESM if needed); non-blocking.
- [ ] T033 Run the full `quickstart.md` validation end-to-end as the final acceptance pass (all gates + the four manual smokes).

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** → **Phase 3 (US1)** → **Phase 4 (US2)** → **Phase 5 (US3)** → **Phase 6 (Polish)**.
- Foundational (T004–T018) BLOCKS all user stories: nothing can be verified until `apps/collab` is ESM, both apps compile on v4, and unit tests pass.
- The user stories are **not** independently shippable here — they verify one shared change. They run in priority order: parity (US1) → gates/version (US2) → data continuity (US3).

### Within Phase 2

- ESM config first (T004 → T005 → T006), then source ESM mechanics (T007, T008).
- T009 (RED) before T010 (GREEN).
- T011, T012, T013 are [P] (different test files); do after T010 establishes the v4 header shape and after the ESM jest config (T006) so the tests run.
- T014 before T015 (typecheck) before T016 (build/run).
- T017 before T018.

### Parallel opportunities

- T001 ‖ T002 (different package.json files).
- T011 ‖ T012 ‖ T013 (different test files).
- T019 ‖ T020 (collab unit vs web unit).
- T025 ‖ T026 (collab vs web coverage).

---

## Parallel Example: Phase 2 test-mock updates

```bash
# After T010 (auth-hook green) and T006 (ESM jest), update remaining mocked payloads in parallel:
Task: "Update web Headers mocks in apps/collab/tests/extensions/origin-check.test.ts"     # T011
Task: "Update web Headers mocks in apps/collab/tests/extensions/connection-limit.test.ts" # T012
Task: "Update v4 payload mocks in apps/collab/tests/server.test.ts + server-payload.test.ts" # T013
```

---

## Implementation Strategy

### MVP (parity first)

1. Phase 1 (bump) → Phase 2 (ESM conversion + compile + unit-green on v4) → Phase 3 (US1: collaboration verified live).
2. **STOP and VALIDATE**: collaboration works identically on the ESM/v4 server. This is the MVP — the upgrade is safe to demo.

### Then harden & confirm

3. Phase 4 (US2): single resolved Yjs, Hocuspocus 4.1.1, all quality gates + audit green.
4. Phase 5 (US3): pre-upgrade documents intact.
5. Phase 6: commit lockfile, mutation check, full quickstart acceptance pass.

---

## Notes

- The ESM conversion is the largest part of the work; the behavioral code change (auth-hook headers) stays tiny and test-first.
- Keep one `yjs` instance — duplicate Yjs silently breaks document identity (research.md R2, SC-004); the `persistence.ts` `import * as Y from 'yjs'` must resolve the same instance as the rest of the workspace.
- ESM jest (`--experimental-vm-modules` + ts-jest `useESM`) and CJS→ESM interop with workspace packages are the fiddly parts; both surface at typecheck/test time. The dual-published Hocuspocus 4 CJS build is the fallback only if ESM jest proves intractable.
- The Hocuspocus wire protocol is backward-compatible v3↔v4, so coordinated deploy is safe and transient skew fails safe.
- Commit after each logical group; never commit with failing tests (Constitution II).
