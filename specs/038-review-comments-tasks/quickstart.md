# Quickstart: Review Comments and Tasks

## What this feature adds
Threaded, resolvable **comments** and assignable **tasks** anchored to passages of an AsciiDoc document, with emoji bodies + reactions, delete / bulk-delete, a detached-comments tray, and a project-wide task panel — all editors-only, with the `.adoc` source untouched.

## Design-first (Claude Design)
Before implementing UI, iterate the five surfaces in **Claude Design** against the synced **asciidocollab Design System**:
`https://claude.ai/design/p/5fb9ab6c-45a8-4812-80ed-a39750386c01`
Prototype: (1) in-editor thread, (2) document comments/tasks panel, (3) project-wide task panel, (4) detached tray, (5) delete/bulk-delete confirms. Freeze layouts → drive the `apps/web/src/components/review/` breakdown.

## Build order (each functional task via `/tdd`)
1. **Domain** — `ReviewComment` entity + `Reaction`; ports `ReviewCommentRepository`, `ReviewReactionRepository` with in-memory fakes; use cases (create, reply, resolve, convert, assign, set-status, delete, bulk-delete ×2, react, list). RBAC + tenant filter live here.
2. **Shared** — DTOs + typed errors in `packages/shared/src/review`.
3. **DB migration (GATED)** — add `ReviewComment`/`ReviewReaction`. **Ask the user before generating/applying** the Prisma migration.
4. **Infrastructure** — Prisma adapters implementing the ports; integration tests vs real Postgres (tenant-filter assertions included).
5. **API** — Fastify routes under `/api/projects/:projectId/...`, schema validation, membership guard, rate-limit config per contract; audit denials + bulk deletes.
6. **Web** — anchor lib (`lib/review/anchor.ts`: relpos encode/decode + quote + section fallback + orphan), decorations (`lib/codemirror/review-decorations.ts`), `use-review-items` hook (fetch + signal + resolve), and the `components/review/*` panels from the frozen designs.
7. **E2E** — Playwright: comment→reply→resolve; convert→assign→task panel; concurrent-edit anchor survival; delete + bulk-delete; viewer read-only.

## How to verify (maps to Success Criteria)
- **SC-001**: two browsers in one document; comment in A appears in B < 2 s.
- **SC-002**: script 100 unrelated edits; ≥ 99% of highlights still cover their passage.
- **SC-003**: project task panel, filter "assigned to me" → all my open tasks < 10 s, no per-doc navigation.
- **SC-004/SC-009**: delete the commented text → item degrades to section, then detached tray; delete a user → their items show "Deleted user", their tasks unassigned.
- **SC-005**: export/download the document → source contains zero comment artifacts.
- **SC-006**: viewer session sees items but no create/edit/delete controls; API returns 403.
- **SC-008**: bulk-delete for a document / project clears items, reflected < 2 s, project-wide leaves zero.

## Run
- Dev stack: `docker-compose.dev.yml` (Postgres + collab); web via the app's dev script; api via its dev script.
- Tests: `pnpm -r test` (domain fakes + infra integration); e2e via `scripts/ci/e2e-local.sh`.
- Gates before commit: `pnpm lint`, `pnpm typecheck`, relevant tests (Constitution Quality Gates).
