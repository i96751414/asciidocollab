import { request, type Page } from '@playwright/test';
import { clearMailpit, waitForEmail, extractInvitationToken } from './mailpit';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const TEST_USER = {
  email: 'admin@example.com',
  password: 'AdminP@ssw0rd123!',
  displayName: 'Admin User',
};

/**
 * Ensures the test admin user exists in the database.
 * Safe to call multiple times — a 403 response means the user is already registered.
 */
export async function ensureTestUser(): Promise<void> {
  const context = await request.newContext({ baseURL: API_URL });
  try {
    await context.post('/auth/register', { data: TEST_USER });
    // 201 = created, 403 = registration closed (user already exists) — both are fine
  } finally {
    await context.dispose();
  }
}

/**
 * Returns whether the system is already configured (at least one user exists).
 */
export async function isConfigured(): Promise<boolean> {
  const context = await request.newContext({ baseURL: API_URL });
  try {
    const response = await context.get('/auth/setup-status');
    const { configured } = await response.json();
    return configured;
  } finally {
    await context.dispose();
  }
}

/**
 * Logs in as the admin user via API. Sets the session cookie on `page`
 * without navigating anywhere. Safe to call in beforeEach/afterEach.
 */
export async function loginAdminViaApi(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.request.post(`${API_URL}/auth/login`, {
    data: { email: TEST_USER.email, password: TEST_USER.password },
  });
}

/**
 * Logs out the current session via API.
 */
export async function logoutViaApi(page: Page): Promise<void> {
  await page.request.post(`${API_URL}/auth/logout`);
}

/**
 * Enables or disables open registration via the admin API.
 * Requires the page to have an active admin session.
 */
export async function adminSetOpenRegistration(page: Page, enabled: boolean): Promise<void> {
  const resp = await page.request.patch(`${API_URL}/admin/settings`, {
    data: { openRegistration: enabled },
  });
  if (!resp.ok()) throw new Error(`adminSetOpenRegistration failed: ${resp.status()} ${await resp.text()}`);
}

/**
 * Creates a second (non-admin) user via the admin invitation flow.
 * Requires an active admin session on `page`.
 * Clears Mailpit before sending the invite.
 * Returns the new user's ID.
 *
 * After this call, `page` still has the admin session (accept-invite
 * is performed in an isolated request context).
 */
export async function createInvitedUser(
  page: Page,
  email: string,
  password = 'TestP@ssw0rd123!',
  displayName = 'Test Invited User',
): Promise<string> {
  await clearMailpit();

  const inviteResp = await page.request.post(`${API_URL}/admin/users/invite`, {
    data: { email },
  });
  if (!inviteResp.ok()) throw new Error(`invite failed: ${inviteResp.status()} ${await inviteResp.text()}`);

  const emailMessage = await waitForEmail(email);
  const token = extractInvitationToken(emailMessage.HTML);

  // Use a fresh context so we don't overwrite the admin session on `page`.
  const context = await request.newContext({ baseURL: API_URL });
  try {
    const acceptResp = await context.post('/auth/accept-invite', {
      data: { token, displayName, password },
    });
    if (!acceptResp.ok()) throw new Error(`accept-invite failed: ${acceptResp.status()} ${await acceptResp.text()}`);
  } finally {
    await context.dispose();
  }

  // Retrieve the user's ID from the admin user list.
  const usersResp = await page.request.get(`${API_URL}/admin/users`);
  const body = await usersResp.json() as { users: Array<{ id: string; email: string }> };
  const user = body.users.find((u) => u.email === email);
  if (!user) throw new Error(`Could not find newly created user with email ${email}`);
  return user.id;
}

/**
 * Deletes a user by email (requires active admin session on `page`).
 * No-op if the user does not exist.
 */
export async function adminDeleteUserByEmail(page: Page, email: string): Promise<void> {
  const usersResp = await page.request.get(`${API_URL}/admin/users`);
  if (!usersResp.ok()) return;
  const body = await usersResp.json() as { users: Array<{ id: string; email: string }> };
  const user = body.users.find((u) => u.email === email);
  if (!user) return;
  await page.request.delete(`${API_URL}/admin/users/${user.id}`);
}
