import { defineConfig, devices } from '@playwright/test';

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
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
