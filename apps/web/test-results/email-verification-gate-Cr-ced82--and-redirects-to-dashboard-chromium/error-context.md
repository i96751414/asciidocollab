# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: email-verification-gate.spec.ts >> Cross-device verify-email UX (Bug #3+5) >> verify-email WITH an active session upgrades the session and redirects to dashboard
- Location: e2e/email-verification-gate.spec.ts:138:7

# Error details

```
Error: adminSetOpenRegistration failed: 403 {"error":{"code":"PERMISSION_DENIED","message":"Administrator access required"}}
```

# Test source

```ts
  1   | import { request, type Page } from '@playwright/test';
  2   | import { clearMailpit, waitForEmail, extractInvitationToken } from './mailpit';
  3   | 
  4   | const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  5   | 
  6   | export const TEST_USER = {
  7   |   email: 'admin@example.com',
  8   |   password: 'AdminP@ssw0rd123!',
  9   |   displayName: 'Admin User',
  10  | };
  11  | 
  12  | /**
  13  |  * Ensures the test admin user exists in the database.
  14  |  * Safe to call multiple times — a 403 response means the user is already registered.
  15  |  */
  16  | export async function ensureTestUser(): Promise<void> {
  17  |   const context = await request.newContext({ baseURL: API_URL });
  18  |   try {
  19  |     await context.post('/auth/register', { data: TEST_USER });
  20  |     // 201 = created, 403 = registration closed (user already exists) — both are fine
  21  |   } finally {
  22  |     await context.dispose();
  23  |   }
  24  | }
  25  | 
  26  | /**
  27  |  * Returns whether the system is already configured (at least one user exists).
  28  |  */
  29  | export async function isConfigured(): Promise<boolean> {
  30  |   const context = await request.newContext({ baseURL: API_URL });
  31  |   try {
  32  |     const response = await context.get('/auth/setup-status');
  33  |     const { configured } = await response.json();
  34  |     return configured;
  35  |   } finally {
  36  |     await context.dispose();
  37  |   }
  38  | }
  39  | 
  40  | /**
  41  |  * Logs in as the admin user via API. Sets the session cookie on `page`
  42  |  * without navigating anywhere. Safe to call in beforeEach/afterEach.
  43  |  */
  44  | export async function loginAdminViaApi(page: Page): Promise<void> {
  45  |   await page.context().clearCookies();
  46  |   await page.request.post(`${API_URL}/auth/login`, {
  47  |     data: { email: TEST_USER.email, password: TEST_USER.password },
  48  |   });
  49  | }
  50  | 
  51  | /**
  52  |  * Logs out the current session via API.
  53  |  */
  54  | export async function logoutViaApi(page: Page): Promise<void> {
  55  |   await page.request.post(`${API_URL}/auth/logout`);
  56  | }
  57  | 
  58  | /**
  59  |  * Enables or disables open registration via the admin API.
  60  |  * Requires the page to have an active admin session.
  61  |  */
  62  | export async function adminSetOpenRegistration(page: Page, enabled: boolean): Promise<void> {
  63  |   const resp = await page.request.patch(`${API_URL}/admin/settings`, {
  64  |     data: { openRegistration: enabled },
  65  |   });
> 66  |   if (!resp.ok()) throw new Error(`adminSetOpenRegistration failed: ${resp.status()} ${await resp.text()}`);
      |                         ^ Error: adminSetOpenRegistration failed: 403 {"error":{"code":"PERMISSION_DENIED","message":"Administrator access required"}}
  67  | }
  68  | 
  69  | /**
  70  |  * Creates a second (non-admin) user via the admin invitation flow.
  71  |  * Requires an active admin session on `page`.
  72  |  * Clears Mailpit before sending the invite.
  73  |  * Returns the new user's ID.
  74  |  *
  75  |  * After this call, `page` still has the admin session (accept-invite
  76  |  * is performed in an isolated request context).
  77  |  */
  78  | export async function createInvitedUser(
  79  |   page: Page,
  80  |   email: string,
  81  |   password = 'TestP@ssw0rd123!',
  82  |   displayName = 'Test Invited User',
  83  | ): Promise<string> {
  84  |   await clearMailpit();
  85  | 
  86  |   const inviteResp = await page.request.post(`${API_URL}/admin/users/invite`, {
  87  |     data: { email },
  88  |   });
  89  |   if (!inviteResp.ok()) throw new Error(`invite failed: ${inviteResp.status()} ${await inviteResp.text()}`);
  90  | 
  91  |   const emailMessage = await waitForEmail(email);
  92  |   const token = extractInvitationToken(emailMessage.HTML);
  93  | 
  94  |   // Use a fresh context so we don't overwrite the admin session on `page`.
  95  |   const context = await request.newContext({ baseURL: API_URL });
  96  |   try {
  97  |     const acceptResp = await context.post('/auth/accept-invite', {
  98  |       data: { token, displayName, password },
  99  |     });
  100 |     if (!acceptResp.ok()) throw new Error(`accept-invite failed: ${acceptResp.status()} ${await acceptResp.text()}`);
  101 |   } finally {
  102 |     await context.dispose();
  103 |   }
  104 | 
  105 |   // Retrieve the user's ID from the admin user list.
  106 |   const usersResp = await page.request.get(`${API_URL}/admin/users`);
  107 |   const body = await usersResp.json() as { users: Array<{ id: string; email: string }> };
  108 |   const user = body.users.find((u) => u.email === email);
  109 |   if (!user) throw new Error(`Could not find newly created user with email ${email}`);
  110 |   return user.id;
  111 | }
  112 | 
  113 | /**
  114 |  * Deletes a user by email (requires active admin session on `page`).
  115 |  * No-op if the user does not exist.
  116 |  */
  117 | export async function adminDeleteUserByEmail(page: Page, email: string): Promise<void> {
  118 |   const usersResp = await page.request.get(`${API_URL}/admin/users`);
  119 |   if (!usersResp.ok()) return;
  120 |   const body = await usersResp.json() as { users: Array<{ id: string; email: string }> };
  121 |   const user = body.users.find((u) => u.email === email);
  122 |   if (!user) return;
  123 |   await page.request.delete(`${API_URL}/admin/users/${user.id}`);
  124 | }
  125 | 
```