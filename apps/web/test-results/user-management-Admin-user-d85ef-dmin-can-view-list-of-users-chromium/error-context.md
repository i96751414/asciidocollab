# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: user-management.spec.ts >> Admin user management (US3) >> admin can view list of users
- Location: e2e/user-management.spec.ts:18:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Admin User')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Admin User')

```

```yaml
- link "AsciiDoCollab":
  - /url: /dashboard
- navigation:
  - link "Projects":
    - /url: /dashboard
  - link "Archived":
    - /url: /dashboard/archived
- heading "Dashboard" [level=1]
- link "Create Project":
  - /url: /dashboard/projects/new
- link "Account":
  - /url: /dashboard/account
- button "Sign Out"
- main:
  - heading "Your Projects" [level=2]
  - link "Archived projects":
    - /url: /dashboard/archived
  - link "New Project":
    - /url: /dashboard/projects/new
  - img
  - heading "No projects yet" [level=3]
  - paragraph: Create your first project to get started with collaborative documentation.
  - link "Create Project":
    - /url: /dashboard/projects/new
- alert
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import {
  3   |   ensureTestUser,
  4   |   loginAdminViaApi,
  5   |   createInvitedUser,
  6   |   adminDeleteUserByEmail,
  7   |   TEST_USER,
  8   | } from './helpers/test-user';
  9   | import { signIn, createProject } from './helpers/test-project';
  10  | 
  11  | const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  12  | 
  13  | test.describe('Admin user management (US3)', () => {
  14  |   test.beforeAll(async () => {
  15  |     await ensureTestUser();
  16  |   });
  17  | 
  18  |   test('admin can view list of users', async ({ page }) => {
  19  |     await signIn(page);
  20  |     await page.goto('/dashboard/admin/users');
  21  | 
  22  |     // The admin user's email/displayName should appear in the list
> 23  |     await expect(page.getByText(TEST_USER.displayName)).toBeVisible({ timeout: 5000 });
      |                                                         ^ Error: expect(locator).toBeVisible() failed
  24  |     await expect(page.getByText(TEST_USER.email)).toBeVisible({ timeout: 5000 });
  25  |   });
  26  | 
  27  |   test('admin can toggle another user admin status', async ({ page }) => {
  28  |     const email = `toggle-admin-${Date.now()}@example.com`;
  29  | 
  30  |     await loginAdminViaApi(page);
  31  | 
  32  |     try {
  33  |       await createInvitedUser(page, email);
  34  | 
  35  |       await page.goto('/dashboard/admin/users');
  36  | 
  37  |       // Find the row for the new user and click "Make Admin"
  38  |       const userRow = page.locator('tr').filter({ hasText: email });
  39  |       await userRow.getByRole('button', { name: /make admin/i }).click();
  40  | 
  41  |       // Button text should toggle to "Remove Admin"
  42  |       await expect(userRow.getByRole('button', { name: /remove admin/i })).toBeVisible({ timeout: 5000 });
  43  | 
  44  |       // Toggle back to non-admin
  45  |       await userRow.getByRole('button', { name: /remove admin/i }).click();
  46  |       await expect(userRow.getByRole('button', { name: /make admin/i })).toBeVisible({ timeout: 5000 });
  47  |     } finally {
  48  |       await loginAdminViaApi(page);
  49  |       await adminDeleteUserByEmail(page, email);
  50  |     }
  51  |   });
  52  | 
  53  |   test('self-demotion is blocked', async ({ page }) => {
  54  |     await signIn(page);
  55  |     await page.goto('/dashboard/admin/users');
  56  | 
  57  |     // Find the admin user's own row — the admin toggle button should not be present
  58  |     // (self-modification is blocked by the API; the UI typically hides it or disables it).
  59  |     // Verify via API: PATCH /admin/users/<self-id>/admin should return 403.
  60  |     const usersResp = await page.request.get(`${API_URL}/admin/users`);
  61  |     const body = await usersResp.json() as { users: Array<{ id: string; email: string }> };
  62  |     const self = body.users.find((u) => u.email === TEST_USER.email);
  63  |     expect(self).toBeDefined();
  64  | 
  65  |     const resp = await page.request.patch(`${API_URL}/admin/users/${self!.id}/admin`, {
  66  |       data: { isAdmin: false },
  67  |     });
  68  |     expect(resp.status()).toBe(403);
  69  |   });
  70  | 
  71  |   test('self-removal is blocked', async ({ page }) => {
  72  |     await signIn(page);
  73  | 
  74  |     const usersResp = await page.request.get(`${API_URL}/admin/users`);
  75  |     const body = await usersResp.json() as { users: Array<{ id: string; email: string }> };
  76  |     const self = body.users.find((u) => u.email === TEST_USER.email);
  77  |     expect(self).toBeDefined();
  78  | 
  79  |     const resp = await page.request.delete(`${API_URL}/admin/users/${self!.id}`);
  80  |     expect(resp.status()).toBe(403);
  81  |   });
  82  | 
  83  |   test('last-admin protection prevents last admin removal', async ({ page }) => {
  84  |     // The admin is the only admin. Demoting them (via a second admin) is blocked by the
  85  |     // "cannot remove last admin" guard. We can verify via API.
  86  |     await signIn(page);
  87  | 
  88  |     const usersResp = await page.request.get(`${API_URL}/admin/users`);
  89  |     const body = await usersResp.json() as { users: Array<{ id: string; email: string; isAdmin: boolean }> };
  90  |     const admins = body.users.filter((u) => u.isAdmin);
  91  | 
  92  |     // If there is exactly one admin, trying to demote them must fail.
  93  |     if (admins.length === 1) {
  94  |       // Self-demotion → 403 (cannot modify self)
  95  |       const resp = await page.request.patch(`${API_URL}/admin/users/${admins[0].id}/admin`, {
  96  |         data: { isAdmin: false },
  97  |       });
  98  |       expect(resp.status()).toBe(403);
  99  |     } else {
  100 |       // Multiple admins exist — verify the "cannot remove last admin" guard with a second admin.
  101 |       // Demote all but one, then try to demote the last one.
  102 |       // This scenario is complex; skip if multiple admins are present (not the target state).
  103 |       test.skip(admins.length > 1, 'Multiple admins present — last-admin guard not testable without teardown');
  104 |     }
  105 |   });
  106 | 
  107 |   test('sole-owner project is transferred (deleted) on user removal', async ({ page }) => {
  108 |     const email = `sole-owner-${Date.now()}@example.com`;
  109 | 
  110 |     await loginAdminViaApi(page);
  111 | 
  112 |     try {
  113 |       const userId = await createInvitedUser(page, email);
  114 | 
  115 |       // Create a project as the invited user
  116 |       await page.context().clearCookies();
  117 |       await page.request.post(`${API_URL}/auth/login`, {
  118 |         data: { email, password: 'TestP@ssw0rd123!' },
  119 |       });
  120 |       const projectId = await createProject(page, `Sole Owner Project ${Date.now()}`);
  121 | 
  122 |       // Switch back to admin and remove the user
  123 |       await loginAdminViaApi(page);
```