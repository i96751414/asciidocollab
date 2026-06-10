# Quickstart: Hocuspocus 4 Upgrade

How to perform and verify the upgrade. Versions are pinned from research.md.

## 1. Bump dependencies

```bash
# Server
pnpm --filter @asciidocollab/collab add @hocuspocus/server@^4.1.1
# Web provider
pnpm --filter @asciidocollab/web add @hocuspocus/provider@^4.1.1
```

Leave `yjs` (13.6.31), `y-protocols` (1.0.7), and `y-codemirror.next` (0.3.5) untouched — already latest and Hocuspocus-4-compatible. Confirm a single resolved version afterward:

```bash
pnpm why yjs        # expect one version: 13.6.31
pnpm why @hocuspocus/server @hocuspocus/provider   # expect 4.1.1
```

## 2. Apply the required code change (auth-hook, test-first)

In `apps/collab/tests/` update the `AuthHookExtension` test's mocked `requestHeaders` from a plain object to a web `Headers` instance (e.g. `new Headers({ origin, cookie })`) — this should make the test **fail** against the old `['origin']` access (red). Then update `apps/collab/src/extensions/auth-hook.ts`:

- `requestHeaders.origin ?? requestHeaders.Origin` → `requestHeaders.get('origin')`
- `requestHeaders.cookie ?? requestHeaders.Cookie` → `requestHeaders.get('cookie')`

Re-run the test (green). Update any other mocked Hocuspocus payloads (`onConnect`/`onDisconnect`/`beforeHandleMessage`) in the collab tests to the v4 shapes as `tsc`/tests dictate.

## 3. Build & type-check the server (resolve the node10 risk)

```bash
pnpm --filter @asciidocollab/collab run typecheck
pnpm --filter @asciidocollab/collab run build
```

If `tsc` cannot resolve Hocuspocus 4 types under `moduleResolution: node10`, set `apps/collab/tsconfig.json` `moduleResolution` to `node16` (or `bundler`) and fix any import-specifier fallout, then re-run. (ESM conversion is a last resort — see research.md R2.)

## 4. Build & type-check the web client

```bash
pnpm --filter @asciidocollab/web run typecheck
pnpm --filter @asciidocollab/web run build
```

Fix any `HocuspocusProvider` option renames flagged by `tsc` (adapt internally, no behavior change).

## 5. Verify behavior parity (the acceptance baseline)

```bash
# Collaboration unit suite
pnpm --filter @asciidocollab/collab exec jest
# Full quality gates
npx eslint .
pnpm run typecheck
pnpm run fresh-onion
pnpm -r build
pnpm --filter @asciidocollab/collab exec jest --coverage   # 90/90/90/90
pnpm audit --audit-level=high
```

Then drive the real end-to-end collaboration suite (coordinated server+web), which exercises a live Hocuspocus 4 server:

```bash
# isolated stack + Playwright collab specs
./scripts/e2e-local.sh        # or run the collab-*.spec.ts subset
```

## 6. Manual smoke (matches the spec's P1/P3 scenarios)

1. Open the same document in two browser sessions; type in one → the other updates live; presence shows both.
2. Drop one client's network briefly → on reconnect it resyncs and role is re-checked; no lost edits.
3. Stop the collab server → opening a document falls back to read-only with the offline notice.
4. Open a document that existed **before** the upgrade → prior content intact; edit and reopen → edits persisted.

## Done when

- Hocuspocus resolves to 4.1.1 (server + provider); one Yjs version (13.6.31).
- All gates green (lint, typecheck, fresh-onion, build, coverage 90/90/90/90, audit, e2e).
- No user-visible change in collaboration; pre-upgrade documents intact.
