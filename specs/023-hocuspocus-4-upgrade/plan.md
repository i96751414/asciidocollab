# Implementation Plan: Hocuspocus 4 Upgrade

**Branch**: `023-hocuspocus-4-upgrade` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/023-hocuspocus-4-upgrade/spec.md`

## Summary

Upgrade the real-time collaboration stack from Hocuspocus **2.15.3 → 4.1.1** (latest stable) on both the self-hosted server (`apps/collab`) and the browser provider (`apps/web`), with **strict behavior parity** (no user-visible change). Research shows the rest of the realtime stack is already at the newest Hocuspocus-4-compatible versions — **`yjs@13.6.31`, `y-protocols@1.0.7`, `y-codemirror.next@0.3.5` need no version change** — so the only dependency bump is the two `@hocuspocus/*` packages.

The migration is well-bounded:

- **`apps/collab` moves from CommonJS to native ESM** (maintainer direction) and consumes Hocuspocus 4's ESM build. This means `"type": "module"`, `module/moduleResolution: NodeNext`, explicit `.js` import extensions across `src/`, dropping the `createRequire('yjs')` CJS workaround, and switching the jest config to ts-jest ESM. Hocuspocus 4 keeps `Server.configure({...})`, so the server's API shape is unchanged.
- The one required behavioral code change is in the auth extension: v4 delivers hook request headers as a web-standard `Headers` object, so `requestHeaders.origin` / `requestHeaders.cookie` become `requestHeaders.get('origin')` / `requestHeaders.get('cookie')`.
- `apps/web` is already ESM (Next.js) — only the provider version bumps.
- The Hocuspocus **wire protocol is backward-compatible** across v3↔v4, which de-risks rollout version skew.

## Technical Context

**Language/Version**: TypeScript on Node.js 24 (Hocuspocus 4 requires Node ≥ 22 — satisfied), pnpm monorepo.

**Primary Dependencies**:
- Changing: `@hocuspocus/server` 2.15.3 → **4.1.1** (`apps/collab`); `@hocuspocus/provider` 2.15.3 → **4.1.1** (`apps/web`).
- Unchanged (already latest Hocuspocus-4-compatible): `yjs@13.6.31` (peer `^13.6.8`), `y-protocols@1.0.7` (peer `^1.0.6`), `y-codemirror.next@0.3.5`. Present across `apps/collab`, `apps/web`, `apps/api`, `packages/infrastructure`.

**Storage**: Yjs document state persisted via the filesystem Yjs-state store + Postgres (Prisma) document/session rows. Formats unchanged (Yjs stays on the same major).

**Testing**: jest + ts-jest per package (`apps/collab` 90/90/90/90 coverage gate, node env, 120s timeout); Playwright collaboration e2e in `apps/web/e2e` (`collab-*.spec.ts`); testcontainers for infra integration.

**Target Platform**: Linux Node server (`apps/collab`), Next.js web client (browsers), `apps/api` Fastify server.

**Project Type**: Web — collaboration WebSocket server + web client + REST API in a pnpm workspace.

**Performance Goals**: Real-time sync parity (concurrent edits visible within ~1s); no measurable regression.

**Constraints**: Strict behavior parity; preserve the security boundaries in the auth extension (CSWSH Origin allowlist + cookie-based auth handshake) and the FR-011 active-session edit lock; all quality gates green (lint, typecheck, fresh-onion, `pnpm -r build`, per-package coverage 90/90/90/90, audit `--audit-level=high`, Playwright e2e).

**Module format**: `apps/collab` converts CommonJS → **native ESM** (`"type": "module"`, `module/moduleResolution: NodeNext`, `.js` import extensions, ts-jest ESM). `apps/web` stays as-is (already ESM via Next.js).

**Scale/Scope**: Two dependency bumps; one required behavioral edit (auth-hook headers); plus the `apps/collab` CJS→ESM conversion (config + `.js` import extensions + jest ESM + interop checks). Existing collaboration tests + e2e are the parity baseline.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **II. TDD / Red-Green-Refactor** — A parity upgrade; the existing collaboration unit tests (`apps/collab/tests/*`) and Playwright collab e2e are the executable spec. The one behavioral code change (auth-hook header access) MUST be driven test-first: update the test to feed a web `Headers` payload (red), then make the code green. **PASS** (auth-hook test updated red→green).
- **III. Seam Testing with In-Memory Fakes** — Repository seams keep using in-memory fakes; Hocuspocus hook payloads are an IO boundary and stay mocked (permitted by III). Mocked payloads MUST be updated to v4 shapes (web `Headers`). **PASS**.
- **IV. Reuse Before Rebuild** — Leans further on the maintained upstream library; no re-derivation. **PASS**.
- **VIII. Editor Pipeline Integrity (Sanitization & Scroll-Sync)** — The provider/`y-codemirror.next` binding feeds the editor. The upgrade MUST NOT change preview sanitization or scroll-sync; both are exercised by existing tests and this plan asserts no change to those seams. **PASS (no change; verified by existing tests).**
- **Security** (`.specify/memory/security_constitution.md`) — The auth extension is a security boundary (CSWSH Origin allowlist, cookie-auth handshake, connection/rate caps). The header-access migration MUST preserve identical accept/deny behavior, and the dependency audit MUST stay clean at the enforced severity. Moving off a 3-major-old library is net-positive for security. **PASS (auth parity asserted + audit gate).**
- **Architecture** (`.specify/memory/architecture_constitution.md`) — Changes confined to the app layer (`apps/collab`, `apps/web`) and dependency versions; no domain/infrastructure contract changes, no new cross-layer dependencies. **PASS.**
- **Quality Gates** — `fresh-onion`, lint, typecheck, build, coverage, audit, e2e remain the merge bar. **PASS (must be green post-upgrade).**

No violations → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/023-hocuspocus-4-upgrade/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── collaboration-contract.md
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
apps/collab/                          # Hocuspocus SERVER — primary upgrade target
├── package.json                      # bump @hocuspocus/server 2 → 4
├── tsconfig.json                     # moduleResolution node10 → validate exports/types resolution
├── jest.config.cjs                   # confirm ts-jest resolves Hocuspocus 4 types
├── package.json                      # also: "type": commonjs → module; test script --experimental-vm-modules
├── tsconfig.json                     # module/moduleResolution → NodeNext
├── jest.config.cjs                   # ts-jest ESM (useESM, extensionsToTreatAsEsm, .js moduleNameMapper)
└── src/                              # add explicit .js extensions to all relative imports
    ├── server.ts                     # Server.configure({...}); verify hook payload types (v4)
    ├── index.ts                      # server.listen(); shutdown
    └── extensions/
        ├── auth-hook.ts              # REQUIRED: requestHeaders.get('origin'|'cookie') (web Headers)
        ├── connection-limit.ts       # verify onConnect/onDisconnect payload + context fields
        └── persistence.ts            # drop createRequire(__filename)('yjs') → import * as Y from 'yjs'

apps/web/                             # Hocuspocus PROVIDER (bundled by Next — ESM-safe)
├── package.json                      # bump @hocuspocus/provider 2 → 4
└── src/
    ├── hooks/use-collab-document.ts  # HocuspocusProvider({...}) options — verify v4 parity
    ├── hooks/use-collab-presence.ts  # awareness (y-protocols) — unchanged
    └── components/editor/editor-collab-extensions.ts  # y-codemirror.next yCollab — unchanged

apps/api/                             # uses yjs only (unchanged) — no Hocuspocus dep
packages/infrastructure/              # filesystem Yjs-state store — yjs unchanged
```

**Structure Decision**: No directory restructure. The work is dependency bumps in `apps/collab` and `apps/web`, the auth-hook header-access edit, and the **`apps/collab` CommonJS → ESM conversion** (`type: module`, NodeNext, `.js` import extensions, ts-jest ESM, drop the `createRequire` workaround, verify CJS→ESM interop with workspace packages). `apps/web` is unchanged structurally (already ESM). The dual-published Hocuspocus 4 CJS build remains a fallback only if ESM jest proves intractable (research.md R2).

## Complexity Tracking

> No Constitution violations — section intentionally empty.
