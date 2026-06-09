---
description: "Task list for Real-time Co-editing (Editor Integration)"
---

# Tasks: Real-time Co-editing (Editor Integration)

**Input**: Design documents from `/specs/020-realtime-co-editing/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: TDD is REQUESTED and is NON-NEGOTIABLE per the Constitution. Every implementation task is preceded by a failing test. Domain use cases use **in-memory fakes** (not mocks); the API route uses integration tests; web hooks/components use Jest + Testing Library; cross-user behaviour uses Playwright E2E.

**Organization**: Grouped by user story (US1 P1 → US4 P3), each independently testable. User emphases — security, performance, REST-API refactor, no-data-loss (edit + shutdown) — are threaded through the relevant stories and consolidated in the final phase.

## Path Conventions (Architecture Constitution)

| Package / App | Source root | Test root |
|---|---|---|
| `packages/domain` | `packages/domain/src/` | `packages/domain/tests/` |
| `packages/shared` | `packages/shared/src/` | `packages/shared/tests/` |
| `apps/api` | `apps/api/src/` | `apps/api/tests/` |
| `apps/collab` | `apps/collab/src/` | `apps/collab/tests/` |
| `apps/web` | `apps/web/src/` | `apps/web/tests/` (E2E in `apps/web/e2e/`) |

No `__tests__/`, no co-located tests, no `any`, no `as` casts (P0 rules 5–7).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the collaboration client stack and configuration.

- [X] T001 Add web collab dependencies to `apps/web/package.json`: `yjs` (pin `^13.6.31` to match `apps/collab`), `@hocuspocus/provider`, `y-codemirror.next`, `y-protocols`; run `pnpm install`.
- [X] T002 Verify a single Yjs instance: run `pnpm --filter @asciidocollab/web why yjs` and confirm one resolved version (research D2); document the result in `specs/020-realtime-co-editing/research.md` if it deviates.
- [X] T003 [P] Add `NEXT_PUBLIC_COLLAB_URL` (default `ws://localhost:4002`) to root `.env.example` and read it in `apps/web/src/lib/editor-config.ts` as a named constant (no magic strings).
- [X] T004 [P] Add a named presence-colour palette constant + `awareness` throttle interval constant to `apps/web/src/lib/editor-config.ts` (used by colour derivation and awareness updates).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The collab-info contract (server + client) and the provider/document lifecycle hook. **All user stories depend on these.**

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

### Shared DTO
- [X] T005 Add `CollabDocumentInfo { yjsStateId: string; role: CollabAuthRole }` to `packages/shared/src/dtos/collab.dto.ts` (reuse existing `CollabAuthRole`; export from `packages/shared/src/dtos/index.ts`). No type duplication (P0 rule 4).

### Domain use case (TDD: test → impl)
- [X] T006 [P] Write failing test `packages/domain/tests/use-cases/content/get-document-collab-info.test.ts` using in-memory fakes for `ProjectMemberRepository`, `FileNodeRepository`, `DocumentRepository`: editor→`role:'editor'`, viewer→`role:'observer'`, non-member→membership error, asset/no-Document→`ContentNotFoundError`, returns `yjsStateId`.
- [X] T007 Implement `GetDocumentCollabInfoUseCase` in `packages/domain/src/use-cases/content/get-document-collab-info.ts` (reuse `requireMemberAndFileNode`; `Result<CollabDocumentInfo, DomainError>`; role mapping `viewer→observer`); export from the domain package index. Make T006 green.

### API route (TDD: test → impl) — security: schema validation + membership
- [X] T008 Write failing integration test `apps/api/tests/routes/file-collab-info.test.ts`: 200 `{yjsStateId,role}` with correct role mapping; 401 unauthenticated; 403 non-member; 404 binary asset / unknown node (per `contracts/get-collab-document-info.md`).
- [X] T009 Add `GET /projects/:projectId/files/:fileNodeId/collab` to `apps/api/src/routes/projects/file-content.ts`: Fastify schema-validate path params, delegate entirely to `GetDocumentCollabInfoUseCase` (no business logic in handler — P0 rule 2), map domain errors to 403/404. Make T008 green.

### Web API client (TDD: test → impl)
- [X] T010 [P] Write failing test `apps/web/tests/lib/api/collab.test.ts` for `getCollabDocumentInfo(projectId, fileNodeId)`: parses 200 JSON, returns `null` on 404 (drives legacy path), throws on 401/5xx.
- [X] T011 Implement `apps/web/src/lib/api/collab.ts` `getCollabDocumentInfo()` (`fetch` with credentials, uses `API_BASE_URL`). Make T010 green.

### Provider/document lifecycle hook (TDD: test → impl)
- [X] T012 [P] Write failing test `apps/web/tests/hooks/use-collab-document.test.ts` (fake/injected provider): exposes `ConnectionState` transitions `connecting→synced`, `reconnecting` on drop, `offline` when never synced within timeout; tears down provider + Y.Doc and clears awareness on unmount/file-switch (FR-015, FR-016).
- [X] T013 Implement `apps/web/src/hooks/use-collab-document.ts`: owns `HocuspocusProvider` + `Y.Doc` keyed on `(projectId, yjsStateId)`, room name `` `${projectId}/${yjsStateId}` ``, `url` from `NEXT_PUBLIC_COLLAB_URL` (cookie auto-sent on handshake — no token, research D5); surfaces `ConnectionState`; `destroy()` on cleanup. Make T012 green. (FR-001)
- [X] T014 [P] Write failing test `apps/web/tests/lib/collab/color-for-user.test.ts` then implement `apps/web/src/lib/collab/color-for-user.ts` `colorForUser(userId)` → `{color,colorLight}` deterministic over arbitrary ids against the palette (research D9). (Test-first in one task; small pure function.)

**Checkpoint**: Client can discover the room + role and open/track a connection. User stories can begin.

---

## Phase 3: User Story 1 - Two people edit the same file together (Priority: P1) 🎯 MVP

**Goal**: Bind the editor to the Yjs document so edits sync in real time and converge; late joiners get full state. Includes the **REST file-API refactor** so the editing path no longer fights the collab persistence lock.

**Independent Test**: Two editors open the same file; A types → B sees it < 1 s; concurrent edits converge; a third session opened later shows all edits.

### Tests for User Story 1 (write first, must FAIL) ⚠️
- [X] T015 [P] [US1] E2E `apps/web/e2e/collab-editing.spec.ts` (deferred from spec 018): two browser contexts, same file; A types → B sees within ~1 s; concurrent edits converge to identical text (FR-003; SC-001, SC-003).
- [X] T016 [P] [US1] E2E `apps/web/e2e/collab-late-join.spec.ts` (deferred from spec 018): A edits 30 s, B opens later → B sees full content < 2 s with no manual sync (FR-005; SC-002).
- [X] T017 [P] [US1] Component test `apps/web/tests/components/editor/editor-collab-extensions.test.ts`: collab editor mounts with an EMPTY doc and is populated only via the bound `Y.Text('codemirror')` (no REST-seeded content — FR-004/B3); and a remote-origin insertion above the viewport preserves the local scroll position and selection (FR-002).
- [X] T018 [P] [US1] Test `apps/web/tests/hooks/use-file-selection.test.ts`: on the collab path (`getCollabDocumentInfo` returns info) the content `GET /content` fetch is SKIPPED; on 404 (asset) the legacy fetch still runs (B3/M2 — refactor guard).
- [X] T019 [P] [US1] Test `apps/web/tests/components/editor/asciidoc-editor.collab.test.ts`: in collab mode `useAutoSave` is NOT mounted (no `PUT /content`), ETag polling is NOT started, and localStorage drafts/`beforeunload` keepalive are disabled (B2/H1/H2 — refactor guards). Legacy mode retains all of these.
- [X] T020 [P] [US1] Test `apps/web/tests/components/editor/preview-collab.test.ts`: a remote-origin Yjs change still fires the CodeMirror `updateListener` so the preview updates (M3).

### Implementation for User Story 1
- [X] T021 [US1] Implement `apps/web/src/components/editor/editor-collab-extensions.ts`: assemble `yCollab(ytext, provider.awareness, …)` binding `Y.Text('codemirror')`; export a factory taking the Y.Doc/awareness from `use-collab-document`. Make T017 green. (FR-001)
- [X] T022 [US1] Refactor `apps/web/src/components/editor/asciidoc-editor.tsx` to branch by `EditorMode` (research D6): collab mode mounts empty + collab extensions; legacy mode unchanged. Gate "ready" on `synced`.
- [X] T023 [US1] Refactor `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx`: call `getCollabDocumentInfo`, derive mode, pass collab info/connection into the editor; show a connecting state until synced.
- [X] T024 [US1] **Refactor `apps/web/src/hooks/use-file-selection.ts`**: skip the `GET /content` fetch on the collab path; keep it for legacy/asset and offline fallback. Make T018 green.
- [X] T025 [US1] **Refactor `apps/web/src/components/editor/asciidoc-editor.tsx` + `apps/web/src/hooks/use-auto-save.ts` wiring**: do not mount autosave/poll/draft/keepalive on the collab path (the collab server owns persistence — FR-006). Legacy path behaviour preserved. Make T019 green.
- [X] T026 [US1] **No-data-loss (edit) integration test + wiring** `apps/web/tests/integration/collab-persistence-handoff.test.ts`: editing collaboratively then room teardown results in `GET /content` reflecting the edits (relies on server write-back 018 FR-009) — assert the editor does NOT perform its own save and that no edit is dropped at handoff.
- [X] T027 [US1] Make E2E T015 + T016 green; verify preview test T020 green.
- [X] T028 [US1] Add named constants for the sync/offline timeout and room-name format in `apps/web/src/lib/editor-config.ts` (no magic numbers/strings); ensure no `any`/`as` introduced.

**Checkpoint**: Real-time co-editing works; the REST file API no longer conflicts with collaboration; no edits lost at session handoff. **MVP shippable.**

---

## Phase 4: User Story 2 - See where collaborators are working (Priority: P2)

**Goal**: Remote cursors, selections, names, avatars, colours; a presence bar; never render the local user's own overlay.

**Independent Test**: A moves cursor/selects → B sees A's coloured cursor + name + avatar + selection; A sees none of their own; presence bar shows others + count.

### Tests for User Story 2 (write first, must FAIL) ⚠️
- [X] T029 [P] [US2] E2E `apps/web/e2e/collab-awareness.spec.ts` (deferred from spec 018): B sees A's cursor position, selection, display name, avatar; A does NOT see their own overlay (FR-007/FR-008).
- [X] T030 [P] [US2] Component test `apps/web/tests/components/editor/collab-presence-bar.test.tsx`: renders other participants from awareness, excludes the local `clientId`, dedupes the same `userId` across tabs, shows a count (FR-010).

### Implementation for User Story 2
- [X] T031 [US2] In `apps/web/src/hooks/use-collab-document.ts`, set the local awareness `user` field `{userId,name,color,colorLight,avatarUrl?}` from the current user's profile + `colorForUser` (contract `collab-awareness-user.md`); throttle updates per T004 constant.
- [X] T032 [US2] Ensure `editor-collab-extensions.ts` renders remote cursors/selections and omits the local client's overlay (FR-008); pass `colorLight` for selection highlight.
- [X] T033 [P] [US2] Implement `apps/web/src/components/editor/collab-presence-bar.tsx` (avatars/initials + count) and mount it in the editor layout. Make T030 green.
- [X] T034 [P] [US2] Source the current user's display name + avatar URL for awareness (reuse existing auth/profile context in `apps/web`; add a small selector if needed) — no new avatar storage (reuse account avatars).
- [X] T035 [US2] Edge case: participant with no avatar → coloured initial; verify in T030/T029.
- [X] T036 [US2] Make E2E T029 green; confirm presence overlays disappear within the awareness-timeout constant (T004) on disconnect (FR-009).

**Checkpoint**: US1 + US2 work independently.

---

## Phase 5: User Story 3 - Undo only my own changes (Priority: P3)

**Goal**: Per-user undo/redo via a Yjs `UndoManager` scoped to the local origin; replace native CodeMirror history on the collab path.

**Independent Test**: A makes two edits, B one between; A undoes twice → only A's edits revert, B's remains; A redoes → A's return.

### Tests for User Story 3 (write first, must FAIL) ⚠️
- [X] T037 [P] [US3] E2E `apps/web/e2e/collab-undo.spec.ts` (new): interleaved A/B edits; A undo reverts only A's edits, never B's; A redo restores; all clients converge (FR-011, SC-004).
- [X] T038 [P] [US3] Unit/component test `apps/web/tests/components/editor/collab-undo.test.ts`: `UndoManager` tracks only the local sync origin; undo of remote-origin changes is a no-op for the local user.

### Implementation for User Story 3
- [X] T039 [US3] In `editor-collab-extensions.ts`, construct `Y.UndoManager(ytext, { trackedOrigins })` and pass to `yCollab`; add `yUndoManagerKeymap` (research D10). Make T038 green.
- [X] T040 [US3] Remove CodeMirror native `history()`/default undo keymap on the collab path only (keep on legacy path) to avoid double-undo.
- [X] T041 [US3] Make E2E T037 green.

**Checkpoint**: US1–US3 independently functional.

---

## Phase 6: User Story 4 - Read-only access when editing is unavailable (Priority: P3)

**Goal**: Observers (viewers) get a live read-only editor; when the collab server is unreachable, the editor opens read-only with a clear banner and loses no edits (discharges spec 018 FR-012).

**Independent Test**: (a) viewer opens file → read-only, sees live edits/presence; (b) collab stopped → editor read-only + "editing unavailable" banner, no silent edits.

### Tests for User Story 4 (write first, must FAIL) ⚠️
- [X] T042 [P] [US4] E2E `apps/web/e2e/collab-observer.spec.ts` (deferred from spec 018): a viewer connects as observer → editor read-only, live edits/presence visible, edit attempts rejected (FR-012; 018 FR-004 / US3 AC5).
- [X] T043 [P] [US4] Component test `apps/web/tests/components/editor/editor-readonly.test.tsx`: `role:'observer'` → `EditorState.readOnly` + `editable:false`, remote updates still apply (research D8).
- [X] T044 [P] [US4] Component test `apps/web/tests/components/editor/editor-offline.test.tsx`: when connection never reaches `synced` within timeout → mode `offline-readonly`, content seeded from `GET /content`, "editing unavailable" banner shown, editor read-only, NO edit accepted (FR-013, no data loss).
- [X] T045 [P] [US4] Test `apps/web/tests/components/editor/editor-banners.test.tsx`: connection-state banners for `connecting`/`reconnecting`/`offline`/`synced` (FR-014).
- [X] T046 [P] [US4] Component test `apps/web/tests/components/editor/editor-role-change.test.tsx`: when a role re-check on reconnect returns `observer` (editor demoted to viewer mid-session), the editor flips to read-only without a page reload (spec Edge Case "permission change mid-session"; FR-012).

### Implementation for User Story 4
- [X] T047 [US4] Wire read-only in `asciidoc-editor.tsx` for `observer` and `offline-readonly` modes (`EditorState.readOnly.of(true)` + `EditorView.editable.of(false)`); keep collab extension active for observers so live updates render. Make T043 green.
- [X] T048 [US4] Implement offline fallback in `project-editor-layout.tsx` + `use-file-selection.ts`: on `offline` connection state, seed content from `GET /content` and render read-only. Make T044 green.
- [X] T049 [US4] Add connection-state + read-only + "editing unavailable" banners in `apps/web/src/components/editor/editor-banners.tsx`. Make T045 green.
- [X] T050 [US4] Implement mid-session role enforcement in `apps/web/src/hooks/use-collab-document.ts` + `asciidoc-editor.tsx`: re-fetch `getCollabDocumentInfo` on reconnect and apply the returned role, flipping to read-only when demoted (no reload). Make T046 green. (Note: relies on reconnect/role re-check; the server independently rejects observer writes as a backstop.)
- [X] T051 [US4] Verify reconnection (FR-016): on drop→restore, Yjs reconciles and editing resumes without losing the user's place; covered by `use-collab-document` test T012 — extend if needed.
- [X] T052 [US4] Make E2E T042 green.

**Checkpoint**: All user stories independently functional.

---

## Phase 7: Security & Ops Hardening (Constitution: `security_constitution.md` §API & §Audit) 🔒

**Purpose**: Secure the now browser-facing collaboration WebSocket (`apps/collab`, default port 4002). It listens directly via Hocuspocus (`server.ts` → `Server.configure` + `index.ts` `server.listen()`) — **not** behind Fastify — so it inherits none of the API's rate-limit/body-size protections. Enforcement is **in-app** in the Hocuspocus `onConnect`/auth-hook seam (decision 1a), not delegated to a proxy.

**⚠️ BLOCKING**: closes CRITICAL/HIGH Security-Constitution gaps for a public endpoint — must be complete before this feature is considered done. The WS server was built in spec 018; feature 020 operationalizes it, so the hardening lands here. These tasks are server-side (`apps/collab`/`apps/api`) and independent of the web user stories — they may run in parallel with US1–US4.

### Configuration keys (do first — the tasks below consume them)
- [X] T053 Add collab security config keys to `apps/collab/src/config/collab-config.ts` (convict schema + validation mirroring `authTimeoutMs`/`watchdogIntervalMs`) and to `.env.example`: `ASCIIDOCOLLAB_COLLAB_ALLOWED_ORIGINS` (CSV), `ASCIIDOCOLLAB_COLLAB_MAX_PAYLOAD_BYTES`, `ASCIIDOCOLLAB_COLLAB_MAX_CONNECTIONS_PER_USER`, `ASCIIDOCOLLAB_COLLAB_MAX_ROOMS_PER_USER`, `ASCIIDOCOLLAB_COLLAB_CONNECT_RATE_PER_MIN`. Test `apps/collab/tests/config/collab-config.test.ts` asserts parsing + invalid-value rejection. (CFG1)

### Rate limiting & connection caps — in-app onConnect (SEC1)
- [X] T054 [P] Write failing test `apps/collab/tests/extensions/connection-limit.test.ts`: a connection is rejected (close code 1008) when the authenticated user exceeds `MAX_CONNECTIONS_PER_USER`, `MAX_ROOMS_PER_USER`, or `CONNECT_RATE_PER_MIN`; within-limit connections pass.
- [X] T055 Implement `apps/collab/src/extensions/connection-limit.ts` and wire it into the `onConnect` seam (`apps/collab/src/server.ts`), keyed on the authenticated user from the auth hook. Make T054 green. (SEC1, NFR-001)

### Origin allowlist + cookie SameSite (SEC2)
- [X] T056 [P] Write failing test `apps/collab/tests/extensions/origin-check.test.ts`: a handshake whose `Origin` is not in `ALLOWED_ORIGINS` is rejected; an allowed origin passes. Add an `apps/api` test asserting the session cookie is issued with `SameSite=Lax` (or stricter) — defence-in-depth against cross-site WS hijacking.
- [X] T057 Validate `Origin` against the allowlist in the collab handshake (`auth-hook.ts`/`onConnect`) before the auth fetch; confirm/lock the session-cookie `SameSite` attribute in `apps/api` session config. Make T056 green. (SEC2, NFR-002)

### Max payload (SEC3)
- [X] T058 [P] Write failing test `apps/collab/tests/server-payload.test.ts`: an inbound message exceeding `MAX_PAYLOAD_BYTES` is rejected/closed without crashing the server.
- [X] T059 Enforce the max-payload limit at the WS layer in `apps/collab/src/server.ts` (`Server.configure`). Make T058 green. (SEC3, NFR-003)

### Authorization-denial logging (SEC4)
- [X] T060 [P] Write failing test `apps/collab/tests/extensions/auth-hook.test.ts` (extend): a 403 denial (non-member) and an observer write-rejection are logged with actor (userId), resource (room/documentName), and reason; cookie/secret redaction preserved.
- [X] T061 Add authorization-denial logging on the collab auth path (`auth-hook.ts`) and the new `GET …/collab` 403 path (actor/resource/reason). Make T060 green. (SEC4, NFR-004)

**Checkpoint**: the public WS endpoint is rate-limited, origin-restricted, payload-bounded, and denials are audited — `security_constitution.md` §API & §Audit satisfied.

---

## Phase 8: Polish & Cross-Cutting (Performance · Data Integrity · Refactor cleanup · Docs)

**Purpose**: Remaining cross-cutting requirements applied across all stories.

### Security regression
- [X] T062 [P] Security: assert observer write-rejection is enforced server-side (regression test referencing the existing `apps/collab` persistence role check) so a tampered client cannot persist edits; confirm the new `GET …/collab` route leaks nothing for non-members (extend T008).
- [X] T063 [P] Security: confirm WS auth relies only on the session cookie (no token in URL/logs); document the production transport (`wss://`) and same-site/cookie-domain requirements in `quickstart.md` and `.env.example` (research D5; SEC5; NFR-005). Verify no secrets or internal paths in the diff.

### Performance
- [ ] T064 [P] Performance: add timing assertions to E2E (remote edit visible < 1 s SC-001; late-join < 2 s SC-002) and a large-document smoke test; confirm awareness updates are throttled (T004) to avoid presence spam.

### Data integrity (no loss on edit or shutdown)
- [ ] T065 No-data-loss (shutdown): regression test that with the editor no longer doing REST saves, the collab server's shutdown flush + room-teardown write-back (018 FR-009/FR-013) remain the persistence guarantee — edit, send SIGTERM to `apps/collab`, restart, reopen, assert content present. Document the dependency in `plan.md` if any gap is found.
- [X] T066 [P] No-data-loss (connection drop): test that edits made while `reconnecting` are buffered by Yjs and flushed on reconnect (no loss); and that `offline-readonly` accepts zero edits (no silent loss) — ties T044/T051 together.

### Refactor cleanup & gates
- [X] T067 [P] Refactor verification: confirm the legacy REST path (assets + non-collab) is fully intact and no dead/duplicated content-loading code remains in `use-file-selection.ts`/`use-auto-save.ts`; remove any now-unused branches.
- [X] T068 [P] CI/E2E wiring: start `apps/collab` via `pnpm --filter @asciidocollab/collab start &` in the CI e2e job (like `apps/api`/web — NOT docker-compose; decision 3b) and in `scripts/e2e-local.sh`; add the `ASCIIDOCOLLAB_COLLAB_*` env vars and a `Wait for collab server` step; remove the "deferred to Phase 9" note at `.github/workflows/ci.yml:191-192` (fulfils spec-018 T054).
- [X] T069 [P] Run `pnpm lint` and `pnpm typecheck` across affected packages — zero warnings/errors; verify no `any`/`as` casts introduced (P0 rules 5–6).
- [X] T070 Run `specs/020-realtime-co-editing/quickstart.md` end-to-end manually (all four user stories).
- [X] T071 [P] Docs: update `apps/web` editor docs + `AGENTS.md` (collab vs legacy mode, `GET …/collab`); update **`README.md`** (env-var table: `NEXT_PUBLIC_COLLAB_URL` + new `ASCIIDOCOLLAB_COLLAB_*` keys; flip the "Real-time collaboration ❌ Not started" status; add `apps/collab` to run instructions) and **`CONTRIBUTING.md`** (local dev/test must start `apps/collab`; list the processes). (DOC1, DOC2)

---

## Dependencies & Execution Order

### Phase order
- **Setup (P1)** → **Foundational (P2)** blocks everything → **US1 (P3)** → **US2 (P4)** → **US3 (P5)** → **US4 (P6)** → **Security & Ops Hardening (P7)** → **Polish (P8)**.
- US2/US3/US4 each depend only on Foundational + the US1 editing path being mounted; they do not depend on each other and can be parallelized across developers.
- **Security & Ops Hardening (P7)** is server-side (`apps/collab`/`apps/api`) and independent of the web stories — it may run in parallel with US1–US4, but MUST be complete (blocking) before the feature is merged/shipped.

### Critical path
T001→T013 (stack + endpoint + provider hook) → T021–T025 (binding + REST refactor) → T027 (US1 green). US1 is the MVP.

### Within each story
- E2E + unit tests written first and confirmed failing, then implementation (TDD, Constitution Principle II).
- Commit only on green; never commit failing tests.

## Parallel Opportunities

- Setup: T003, T004 in parallel.
- Foundational: T006, T010, T012, T014 (different files) in parallel; T005 before T007/T009.
- US1 tests T015–T020 in parallel before implementation.
- US2 tests T029–T030; US4 tests T042–T046 in parallel within their stories.
- Security & Ops Hardening: tests T054, T056, T058, T060 in parallel (after config T053); impl tasks T055/T057/T059/T061 follow their tests.
- Polish: T062, T063, T064, T066, T067, T068, T069, T071 largely parallel.

## Parallel Example: User Story 1 tests

```bash
Task: "E2E collab-editing.spec.ts"        # T015
Task: "E2E collab-late-join.spec.ts"      # T016
Task: "empty-init binding test"           # T017
Task: "use-file-selection collab skip"    # T018
Task: "autosave/poll/draft disabled test" # T019
Task: "preview continuity test"           # T020
```

## Implementation Strategy

### MVP first (US1)
Setup → Foundational → US1 (incl. REST refactor + no-data-loss handoff) → validate two-user co-editing → ship.

### Incremental delivery
US1 (co-editing) → US2 (presence) → US3 (collaborative undo) → US4 (read-only/offline). Each adds value without breaking the previous. The Security & Ops Hardening phase (P7) and Polish data-integrity/performance tasks MUST be complete before merge.

## Notes
- [P] = different files, no incomplete-task dependency.
- The 5 Playwright specs require `apps/api` + `apps/collab` running, both started via `pnpm` (T068 CI/E2E wiring) — collab is NOT in docker-compose (infra-only there).
- No schema migration in this feature (`yjsStateId` already on `Document`).
- Server-side persistence (write-back + shutdown flush) is the sole save mechanism while a room is active — T026/T065/T066 guard against data loss.
- The collaboration WebSocket is a public endpoint hardened in Phase 7 (rate-limit, origin allowlist, max-payload, denial logging) per `security_constitution.md`.
