# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: open-registration-toggle.spec.ts >> Open registration toggle (US4) >> admin can enable/disable open registration
- Location: e2e/open-registration-toggle.spec.ts:41:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /disabled — click to enable|enabled — click to disable/i }).filter({ hasText: /disabled/i })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - link "AsciiDoCollab" [ref=e6] [cursor=pointer]:
        - /url: /dashboard
      - navigation [ref=e7]:
        - link "Projects" [ref=e8] [cursor=pointer]:
          - /url: /dashboard
        - link "Archived" [ref=e9] [cursor=pointer]:
          - /url: /dashboard/archived
    - generic [ref=e10]:
      - generic [ref=e11]:
        - heading "Dashboard" [level=1] [ref=e12]
        - generic [ref=e13]:
          - link "Create Project" [ref=e14] [cursor=pointer]:
            - /url: /dashboard/projects/new
          - link "Account" [ref=e15] [cursor=pointer]:
            - /url: /dashboard/account
          - button "Sign Out" [ref=e16]
      - main [ref=e17]:
        - generic [ref=e18]:
          - generic [ref=e19]:
            - heading "Your Projects" [level=2] [ref=e20]
            - generic [ref=e21]:
              - link "Archived projects" [ref=e22] [cursor=pointer]:
                - /url: /dashboard/archived
              - link "New Project" [ref=e23] [cursor=pointer]:
                - /url: /dashboard/projects/new
          - generic [ref=e24]:
            - img [ref=e26]
            - heading "No projects yet" [level=3] [ref=e28]
            - paragraph [ref=e29]: Create your first project to get started with collaborative documentation.
            - link "Create Project" [ref=e30] [cursor=pointer]:
              - /url: /dashboard/projects/new
  - alert [ref=e31]
```

# Test source

```ts
  1   | import { test, expect, request } from '@playwright/test';
  2   | import {
  3   |   ensureTestUser,
  4   |   loginAdminViaApi,
  5   |   adminSetOpenRegistration,
  6   |   TEST_USER,
  7   | } from './helpers/test-user';
  8   | import { signIn } from './helpers/test-project';
  9   | 
  10  | const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  11  | 
  12  | /**
  13  |  * Resets open registration to false via a standalone context that does not
  14  |  * contaminate the page's cookie jar.
  15  |  */
  16  | async function resetOpenRegistration(): Promise<void> {
  17  |   const context = await request.newContext({ baseURL: API_URL });
  18  |   try {
  19  |     await context.post('/auth/login', { data: { email: TEST_USER.email, password: TEST_USER.password } });
  20  |     await context.patch('/admin/settings', { data: { openRegistration: false } });
  21  |   } finally {
  22  |     await context.dispose();
  23  |   }
  24  | }
  25  | 
  26  | test.describe('Open registration toggle (US4)', () => {
  27  |   test.beforeAll(async () => {
  28  |     await ensureTestUser();
  29  |   });
  30  | 
  31  |   test.beforeEach(async () => {
  32  |     // Ensure a clean baseline regardless of state left by other test files.
  33  |     // Uses a separate context so the page's own cookie jar stays clean.
  34  |     await resetOpenRegistration();
  35  |   });
  36  | 
  37  |   test.afterEach(async () => {
  38  |     await resetOpenRegistration();
  39  |   });
  40  | 
  41  |   test('admin can enable/disable open registration', async ({ page }) => {
  42  |     await signIn(page);
  43  |     await page.goto('/dashboard/admin/users');
  44  | 
  45  |     const toggleButton = page.getByRole('button', { name: /disabled — click to enable|enabled — click to disable/i });
  46  | 
  47  |     // Enable it
> 48  |     await toggleButton.filter({ hasText: /disabled/i }).click();
      |                                                         ^ Error: locator.click: Test timeout of 30000ms exceeded.
  49  |     await expect(page.getByRole('button', { name: /enabled — click to disable/i })).toBeVisible();
  50  | 
  51  |     // Reload and verify persistence
  52  |     await page.reload();
  53  |     await expect(page.getByRole('button', { name: /enabled — click to disable/i })).toBeVisible();
  54  | 
  55  |     // Disable it
  56  |     await page.getByRole('button', { name: /enabled — click to disable/i }).click();
  57  |     await expect(page.getByRole('button', { name: /disabled — click to enable/i })).toBeVisible();
  58  |   });
  59  | 
  60  |   test('login page shows "Create an account" when open registration is enabled', async ({ page }) => {
  61  |     await loginAdminViaApi(page);
  62  |     await adminSetOpenRegistration(page, true);
  63  | 
  64  |     // Sign out, then visit /login
  65  |     await page.context().clearCookies();
  66  |     await page.goto('/login');
  67  |     await expect(page.getByRole('link', { name: /create an account/i })).toBeVisible();
  68  |   });
  69  | 
  70  |   test('login page hides "Create an account" when open registration is disabled', async ({ page }) => {
  71  |     await loginAdminViaApi(page);
  72  |     await adminSetOpenRegistration(page, false);
  73  | 
  74  |     await page.context().clearCookies();
  75  |     await page.goto('/login');
  76  |     await expect(page.getByRole('link', { name: /create an account/i })).not.toBeVisible();
  77  |   });
  78  | 
  79  |   test('direct navigation to /register is blocked when registration is disabled', async ({ page }) => {
  80  |     await loginAdminViaApi(page);
  81  |     await adminSetOpenRegistration(page, false);
  82  |     await page.context().clearCookies();
  83  | 
  84  |     await page.goto('/register');
  85  |     // Should redirect to /login (registration closed + users exist)
  86  |     await expect(page).toHaveURL(/\/login/);
  87  |   });
  88  | 
  89  |   test('open registration setting persists across page reload', async ({ page }) => {
  90  |     await signIn(page);
  91  |     await adminSetOpenRegistration(page, true);
  92  | 
  93  |     await page.goto('/dashboard/admin/users');
  94  |     await expect(page.getByRole('button', { name: /enabled — click to disable/i })).toBeVisible();
  95  | 
  96  |     await page.reload();
  97  |     await expect(page.getByRole('button', { name: /enabled — click to disable/i })).toBeVisible();
  98  |   });
  99  | 
  100 |   test('open-registration-status endpoint is accessible without auth', async ({ page }) => {
  101 |     const response = await page.request.get(`${API_URL}/auth/open-registration-status`);
  102 |     expect(response.status()).toBe(200);
  103 |     const body = await response.json();
  104 |     expect(typeof body.openRegistration).toBe('boolean');
  105 |   });
  106 | });
  107 | 
```