# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-first-run.spec.ts >> First-run setup flow >> after setup, visiting /register redirects to /login
- Location: e2e/auth-first-run.spec.ts:21:7

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/login/
Received string:  "http://localhost:3000/register"
Timeout: 5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    14 × unexpected value "http://localhost:3000/register"

```

```yaml
- heading "Create account" [level=3]
- paragraph: Register for access
- form "Register":
  - text: Display Name
  - textbox "Display Name"
  - text: Email
  - textbox "Email"
  - text: Password
  - textbox "Password"
  - text: Confirm Password
  - textbox "Confirm Password"
  - button "Create account" [disabled]
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { isConfigured, TEST_USER } from './helpers/test-user';
  3  | 
  4  | test.describe('First-run setup flow', () => {
  5  |   test('empty database → visit / → redirect to /register → fill form → land on /dashboard', async ({ page }) => {
  6  |     const configured = await isConfigured();
  7  |     test.skip(configured, 'System already configured — first-run flow cannot be tested on a non-empty database');
  8  | 
  9  |     await page.goto('/');
  10 |     await expect(page).toHaveURL(/\/register/);
  11 |     await expect(page.getByText(/set up your account/i)).toBeVisible();
  12 | 
  13 |     await page.getByLabel(/display name/i).fill(TEST_USER.displayName);
  14 |     await page.getByLabel(/email/i).fill(TEST_USER.email);
  15 |     await page.getByLabel(/password/i).fill(TEST_USER.password);
  16 |     await page.getByRole('button', { name: /create account/i }).click();
  17 | 
  18 |     await expect(page).toHaveURL(/\/dashboard/);
  19 |   });
  20 | 
  21 |   test('after setup, visiting /register redirects to /login', async ({ page }) => {
  22 |     const configured = await isConfigured();
  23 |     test.skip(!configured, 'System not yet configured — register page should still be accessible');
  24 | 
  25 |     await page.goto('/register');
> 26 |     await expect(page).toHaveURL(/\/login/);
     |                        ^ Error: expect(page).toHaveURL(expected) failed
  27 |   });
  28 | });
  29 | 
```