import { defineConfig, devices } from '@playwright/test';

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  // Per-test budget. Kept generous so a COLD first render — the AsciiDoc→HTML web worker and Yjs
  // sync warming up on the first preview/editor mount after the stack starts — has room to complete
  // within a single attempt under gate load, rather than tripping the deadline and surfacing as a
  // flaky retry. Steady-state tests finish in a few seconds; only cold starts approach this.
  timeout: 45_000,
  retries: process.env.CI ? 2 : 0,
  // Cap concurrency for the isolated stack: every collab-backed test opens Yjs sync session(s) against
  // a SINGLE test collaboration server, and collab pair-tests use two browser contexts each. The
  // Playwright default (one worker per CPU core) over-subscribes that server on a many-core machine, so
  // its Yjs sync lags and content-dependent assertions race an empty pre-sync document — surfacing as
  // intermittent failures in the heavy collab+preview specs (preview render, file-restore, outline).
  // 4 keeps the server comfortably within sync budget while staying reasonably fast. The cap is applied
  // UNCONDITIONALLY (not only under CI): a bare local `npx playwright test` must not oversubscribe
  // either. Override with PLAYWRIGHT_WORKERS when you know the run won't contend (e.g. a single spec).
  workers: process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : 4,
  reporter: [['line']],
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
  },
  projects: [
    // Phase 1: First-run test must run before any other test creates users.
    // auth-first-run.spec.ts checks isConfigured() and registers the first admin
    // user (TEST_USER) on an empty database. All other projects depend on this so
    // they start with a known-good user in the database.
    {
      name: 'setup',
      testMatch: '**/auth-first-run.spec.ts',
    },

    // Phase 2a: Email-verification tests enable/disable openRegistration to create
    // unverified users. Runs after setup, concurrently with chromium (chromium tests
    // never touch openRegistration).
    {
      name: 'email-gate',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/email-verification-gate.spec.ts',
      dependencies: ['setup'],
    },

    // Phase 2b: Open-registration toggle tests also mutate openRegistration. By
    // declaring email-gate as a dependency they are guaranteed to run AFTER email-gate
    // finishes, eliminating the concurrent-mutation race condition on that setting.
    {
      name: 'open-reg-toggle',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/open-registration-toggle.spec.ts',
      dependencies: ['email-gate'],
    },

    // Phase 2c: All remaining tests. No dependency on openRegistration — safe to
    // run concurrently with email-gate and open-reg-toggle.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [
        '**/auth-first-run.spec.ts',
        '**/email-verification-gate.spec.ts',
        '**/open-registration-toggle.spec.ts',
      ],
      dependencies: ['setup'],
    },
  ],
});
