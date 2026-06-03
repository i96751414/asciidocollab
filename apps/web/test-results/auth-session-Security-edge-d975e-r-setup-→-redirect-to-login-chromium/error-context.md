# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-session.spec.ts >> Security edge cases >> post-setup register block: visit /register after setup → redirect to /login
- Location: e2e/auth-session.spec.ts:19:7

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
  2  | import { ensureTestUser, TEST_USER } from './helpers/test-user';
  3  | 
  4  | test.describe('Security edge cases', () => {
  5  |   test.beforeAll(async () => {
  6  |     await ensureTestUser();
  7  |   });
  8  | 
  9  |   test('open-redirect: /login?redirect=https://evil.com → after login lands on /dashboard', async ({ page }) => {
  10 |     await page.goto('/login?redirect=https://evil.com');
  11 |     await page.getByLabel(/email/i).fill(TEST_USER.email);
  12 |     await page.getByLabel(/password/i).fill(TEST_USER.password);
  13 |     await page.getByRole('button', { name: /sign in/i }).click();
  14 | 
  15 |     await expect(page).toHaveURL(/\/dashboard/);
  16 |     await expect(page).not.toHaveURL(/evil\.com/);
  17 |   });
  18 | 
  19 |   test('post-setup register block: visit /register after setup → redirect to /login', async ({ page }) => {
  20 |     await page.goto('/register');
> 21 |     await expect(page).toHaveURL(/\/login/);
     |                        ^ Error: expect(page).toHaveURL(expected) failed
  22 |   });
  23 | });
  24 | 
```