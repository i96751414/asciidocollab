# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: registration-invitation.spec.ts >> Registration via invitation (US1) >> admin can send invitation and invitee completes registration
- Location: e2e/registration-invitation.spec.ts:17:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 202
Received: 403
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import {
  3   |   ensureTestUser,
  4   |   loginAdminViaApi,
  5   |   adminDeleteUserByEmail,
  6   |   TEST_USER,
  7   | } from './helpers/test-user';
  8   | import { clearMailpit, waitForEmail, extractInvitationToken } from './helpers/mailpit';
  9   | 
  10  | const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  11  | 
  12  | test.describe('Registration via invitation (US1)', () => {
  13  |   test.beforeAll(async () => {
  14  |     await ensureTestUser();
  15  |   });
  16  | 
  17  |   test('admin can send invitation and invitee completes registration', async ({ page }) => {
  18  |     const email = `invitee-${Date.now()}@example.com`;
  19  |     const password = 'InviteeP@ssw0rd123!';
  20  | 
  21  |     await loginAdminViaApi(page);
  22  |     await clearMailpit();
  23  | 
  24  |     try {
  25  |       // Admin sends invitation
  26  |       const inviteResp = await page.request.post(`${API_URL}/admin/users/invite`, {
  27  |         data: { email },
  28  |       });
> 29  |       expect(inviteResp.status()).toBe(202);
      |                                   ^ Error: expect(received).toBe(expected) // Object.is equality
  30  | 
  31  |       // Get invitation token from Mailpit
  32  |       const emailMessage = await waitForEmail(email);
  33  |       const token = extractInvitationToken(emailMessage.HTML);
  34  | 
  35  |       // Clear admin session — invitee registers without being signed in
  36  |       await page.context().clearCookies();
  37  | 
  38  |       // Visit the accept-invite page
  39  |       await page.goto(`/accept-invite?token=${token}`);
  40  |       await expect(page.getByText(/complete your registration/i)).toBeVisible({ timeout: 5000 });
  41  |       await expect(page.getByRole('textbox', { name: /email/i })).toHaveValue(email);
  42  | 
  43  |       // Fill in the registration form
  44  |       await page.getByLabel(/display name/i).fill('New Invitee');
  45  |       await page.getByLabel('Password', { exact: true }).fill(password);
  46  |       await page.getByLabel(/confirm password/i).fill(password);
  47  |       await page.getByRole('button', { name: /create account/i }).click();
  48  | 
  49  |       // Should land on /dashboard (invitation-based accounts are pre-verified)
  50  |       await page.waitForURL(/\/dashboard/, { timeout: 8000 });
  51  |     } finally {
  52  |       await loginAdminViaApi(page);
  53  |       await adminDeleteUserByEmail(page, email);
  54  |     }
  55  |   });
  56  | 
  57  |   test('expired invitation link shows error', async ({ page }) => {
  58  |     // A syntactically plausible but non-existent token is treated as expired/invalid.
  59  |     await page.goto('/accept-invite?token=expired-invalid-token-xyz-000');
  60  |     await expect(page.getByRole('heading', { name: /invalid/i })).toBeVisible({ timeout: 5000 });
  61  |   });
  62  | 
  63  |   test('already-used invitation shows error', async ({ page }) => {
  64  |     const email = `used-invite-${Date.now()}@example.com`;
  65  | 
  66  |     await loginAdminViaApi(page);
  67  |     await clearMailpit();
  68  | 
  69  |     try {
  70  |       await page.request.post(`${API_URL}/admin/users/invite`, { data: { email } });
  71  | 
  72  |       const emailMessage = await waitForEmail(email);
  73  |       const token = extractInvitationToken(emailMessage.HTML);
  74  | 
  75  |       // Accept the invitation once via API
  76  |       const acceptResp = await page.request.post(`${API_URL}/auth/accept-invite`, {
  77  |         data: { token, displayName: 'First Accept', password: 'TestP@ssw0rd123!' },
  78  |       });
  79  |       expect(acceptResp.status()).toBe(201);
  80  | 
  81  |       // Clear session so we're not authenticated
  82  |       await page.context().clearCookies();
  83  | 
  84  |       // Attempt to use the same token again via the UI
  85  |       await page.goto(`/accept-invite?token=${token}`);
  86  |       await expect(page.getByRole('heading', { name: /invalid/i })).toBeVisible({ timeout: 5000 });
  87  |     } finally {
  88  |       await loginAdminViaApi(page);
  89  |       await adminDeleteUserByEmail(page, email);
  90  |     }
  91  |   });
  92  | 
  93  |   test('duplicate email rejection on invite', async ({ page }) => {
  94  |     await loginAdminViaApi(page);
  95  | 
  96  |     // Try to invite the already-registered admin email — should get 409
  97  |     const resp = await page.request.post(`${API_URL}/admin/users/invite`, {
  98  |       data: { email: TEST_USER.email },
  99  |     });
  100 |     expect(resp.status()).toBe(409);
  101 |   });
  102 | 
  103 |   test('accept-invite page shows invalid state for bad token', async ({ page }) => {
  104 |     await page.goto('/accept-invite?token=invalid-token-xyz');
  105 |     await expect(page.getByRole('heading', { name: /invalid/i })).toBeVisible({ timeout: 5000 });
  106 |   });
  107 | });
  108 | 
```