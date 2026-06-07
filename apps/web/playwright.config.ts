import { defineConfig, devices } from '@playwright/test';

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // 1 retry locally, 2 in CI — covers race conditions between tests that share
  // mutable global state (e.g. openRegistration) in parallel workers.
  retries: process.env.CI ? 2 : 1,
  reporter: [['line']],
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
