# Phase 0 Research: Hocuspocus 4 Upgrade

All NEEDS CLARIFICATION from Technical Context are resolved below.

## R1 — Target versions

**Decision**: Bump `@hocuspocus/server` and `@hocuspocus/provider` from `^2.15.3` to `^4.1.1` (latest stable). Leave `yjs`, `y-protocols`, and `y-codemirror.next` unchanged.

**Rationale** (verified against the npm registry):

| Package | Current | Latest | Hocuspocus 4 peer req | Action |
|---|---|---|---|---|
| `@hocuspocus/server` | `^2.15.3` | `4.1.1` | — | **bump → ^4.1.1** |
| `@hocuspocus/provider` | `^2.15.3` | `4.1.1` | — | **bump → ^4.1.1** |
| `yjs` | `^13.6.31` | `13.6.31` | `^13.6.8` | **no change** (already latest + satisfies peer) |
| `y-protocols` | `^1.0.7` | `1.0.7` | `^1.0.6` | **no change** |
| `y-codemirror.next` | `^0.3.5` | `0.3.5` | (yjs `^13.5.6`) | **no change** |

"Yjs to the most recent and compatible version" (from the spec) is **already satisfied** — Yjs 13.6.31 is both the latest published version and within Hocuspocus 4's peer range. There is no Yjs 14. So the Yjs part of the request is a no-op confirmation, not a code change.

**Alternatives considered**: Pinning to an older Hocuspocus 3.x (rejected — the spec asks for v4, the latest); bumping Yjs to a non-existent newer major (rejected — none exists).

## R2 — Module format: convert the server to ESM

**Decision**: Convert `apps/collab` from CommonJS to **native ESM** and consume Hocuspocus 4's ESM build. (Decision updated per maintainer direction: move to ESM rather than staying on CJS.)

**Rationale**: `@hocuspocus/server@4.1.1` is dual-published (ESM + CJS), so CJS would also work — but ESM is the upstream-preferred entry (`exports.import → dist/hocuspocus-server.esm.js`), aligns the collab service with the modern Node module system, removes the existing CJS workarounds (the `createRequire(__filename)('yjs')` hack in `extensions/persistence.ts`), and uses `node16`/`nodenext` resolution which reads the package `exports`/types map correctly (avoiding the `node10`-vs-`exports` type-resolution problem entirely).

**Scope of the ESM conversion (`apps/collab` only — `apps/web` is already ESM via Next):**

- `package.json`: `"type": "commonjs"` → `"type": "module"`.
- `tsconfig.json`: `module: "CommonJS"` → `"NodeNext"`; `moduleResolution: "node10"` → `"NodeNext"`; keep `target: ES2022`.
- **Relative imports need explicit `.js` extensions** under NodeNext (e.g. `import { compositionRoot } from './composition-root.js'`) across all `apps/collab/src/**` files.
- **CJS globals**: `extensions/persistence.ts` drops `createRequire(__filename)('yjs')` for a normal `import * as Y from 'yjs'` (yjs ships ESM). Any other `__filename`/`__dirname`/`require` usage (only persistence.ts found) is replaced (`import.meta.url` + `fileURLToPath` if a path is needed).
- **Jest (ts-jest) → ESM mode**: `extensionsToTreatAsEsm: ['.ts']`, `transform` with `useESM: true`, a `moduleNameMapper` to strip `.js` from relative specifiers (`'^(\\.{1,2}/.*)\\.js$': '$1'`), a test tsconfig with `module: NodeNext`, and run jest with `--experimental-vm-modules` (e.g. via `NODE_OPTIONS` in the `test` script). `jest.config.cjs` may stay a `.cjs` file.
- **Workspace interop**: collab imports CJS-compiled workspace packages (`@asciidocollab/domain|infrastructure|db|shared`). Node ESM imports named exports from those transpiled-CJS modules via interop — verify the named imports (`YjsStateId`, `ProjectId`, repositories, etc.) resolve at runtime; if any default/named interop issue appears, import the default and destructure.
- **Runtime**: `node dist/index.js` continues to work (dir is now ESM); `dev.sh` unchanged.
- **Stryker** (`mutate`): verify the mutation config still runs under ESM; adjust if needed (non-blocking).

**Risk**: ESM jest config and CJS→ESM interop with workspace packages are the fiddly parts; both are caught at typecheck/test time. If ESM jest proves intractable, the dual-published CJS build remains a safety net (would require reverting `type`/tsconfig), but ESM is the target.

**Alternatives considered**: Staying CommonJS on Hocuspocus 4's CJS build (previously planned; rejected per maintainer direction in favor of ESM and to retire the CJS `createRequire` workaround).

## R3 — Server API: `Server.configure` and hook payloads

**Decision**: Keep `Server.configure({ port, debounce, maxDebounce, extensions, onConnect, onDisconnect, beforeHandleMessage })`. Migrate hook **request-header access** to the web `Headers` API. Re-verify payload field names against v4 types at compile time.

**Rationale** (Hocuspocus v3→v4 release notes): `Server.configure()` "still works the same way — just move `websocketOptions` into the config." The breaking changes are mostly TypeScript/payload-level:

- **Request/Headers are web-standard**: `requestHeaders['key']` → `requestHeaders.get('key')`. This is the one required code change, in `apps/collab/src/extensions/auth-hook.ts`:
  - `requestHeaders.origin ?? requestHeaders.Origin` → `requestHeaders.get('origin')`
  - `requestHeaders.cookie ?? requestHeaders.Cookie` → `requestHeaders.get('cookie')`
  (Headers are case-insensitive, so the `Origin`/`Cookie` fallbacks disappear.)
- `request.socket.remoteAddress` is gone (use `x-forwarded-for`/`x-real-ip`). **Confirm** `auth-hook.ts`/`connection-limit.ts`/`audit-log-denial.ts` do not read `remoteAddress`; current scan shows they do not.
- Server accepts a generic `Context` type param (optional adoption; not required for parity).
- Node ≥ 22 required — satisfied (Node 24).

**To confirm at compile time** (payload fields the code relies on; expected stable but verified by `tsc`): `onConnectPayload.documentName`, `.context`, `.connection.readOnly`, `.requestHeaders`; `onDisconnectPayload.clientsCount`, `.context`, `.document.getConnectionsCount()`; `beforeHandleMessagePayload.update.byteLength`. If any renamed in v4, adapt internally with no behavior change.

**Alternatives considered**: Switching to the new `Hocuspocus`/`crossws` integration pattern (rejected — `Server.configure` parity is simpler and sufficient for a standalone WS server).

## R4 — Provider API (web client)

**Decision**: Bump `@hocuspocus/provider` to 4.1.1 and verify `HocuspocusProvider({...})` constructor options used in `use-collab-document.ts` still match; `awareness` (y-protocols) and `y-codemirror.next` integration are unchanged.

**Rationale**: The provider is bundled by Next.js (ESM-capable), so module format is a non-issue. The wire protocol is backward-compatible (v3↔v4), and the provider's awareness object continues to satisfy the `AwarenessLike` interface used by `use-collab-presence.ts`. Provider option names (`url`, `name`, `document`, `token`, connection callbacks) are verified against v4 types at compile time; any renamed option is adapted with no behavior change.

**Alternatives considered**: None needed.

## R5 — Rollout / version skew

**Decision**: Coordinated deploy (server + web together), per the spec assumption. No special compatibility shim required.

**Rationale**: Hocuspocus's wire protocol is backward-compatible across v3↔v4 in both directions (v4 provider defaults to `sessionAwareness: false` against an older server; an older provider's plain document names are accepted by a v4 server). This means a transient old-client/new-server (or vice-versa) window during deploy will not corrupt content — it fails safe — even though coordinated deploy is the intended path.

## R6 — Data continuity

**Decision**: No data migration. Persisted Yjs state and the on-disk/DB formats are unaffected.

**Rationale**: Yjs stays on the same version (13.6.31), so the binary update/state encoding is identical. Hocuspocus persistence is handled by the project's own `PersistenceExtension` (custom), which serializes via `yjs` directly — unchanged by the Hocuspocus bump. Documents created pre-upgrade load and edit post-upgrade unchanged (FR-007 / SC-003).

## R7 — Test & gate strategy

**Decision**: Use the existing collaboration unit suite (`apps/collab/tests/*`), Playwright collab e2e (`apps/web/e2e/collab-*.spec.ts`), and the full quality-gate set as the parity acceptance baseline. Update mocked Hocuspocus payloads to v4 shapes (web `Headers`).

**Rationale**: The collab tests mock Hocuspocus payloads at the IO boundary (permitted by Constitution III). The auth-hook test must switch its mocked `requestHeaders` from a plain object to a `Headers` instance (red), matching the v4 contract, before the code is updated to `.get()` (green). All other suites should pass unchanged. The `apps/collab` 90/90/90/90 coverage gate and the dependency audit (`--audit-level=high`) must remain green.

**Alternatives considered**: Adding new bespoke integration tests against a live Hocuspocus 4 server (deferred — the existing e2e already drives a real server end-to-end).

## Open risks (carried into tasks)

1. ESM conversion of `apps/collab` (R2) — `.js` import extensions, ESM jest config, and CJS→ESM interop with workspace packages; all caught at typecheck/test time.
2. v4 payload field renames (R3) — caught by `tsc`; adapt internally.
3. Provider option renames (R4) — caught by `tsc`; adapt internally.
4. `apps/collab` coverage gate may shift if the auth-hook branch count changes — keep the new code covered.
