import { Page } from '@playwright/test';
import { TEST_USER } from './test-user';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Signs in via the UI login form and waits until the browser lands on /dashboard.
 */
export async function signIn(
  page: Page,
  email: string = TEST_USER.email,
  password: string = TEST_USER.password,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/);
}

/**
 * Creates a project via the API using the browser's shared cookie jar.
 * Must be called after `signIn` so the session cookie is present.
 * Returns the new project's ID.
 */
export async function createProject(page: Page, name: string): Promise<string> {
  const response = await page.request.post(`${API_URL}/api/projects`, {
    data: { name, description: null, tags: [] },
  });

  if (!response.ok()) {
    throw new Error(`createProject failed: ${response.status()} ${await response.text()}`);
  }

  const body = await response.json();
  return body.data.id;
}

/**
 * Deletes a project via the API.  Errors are silently swallowed so this is
 * safe to call from `afterEach` even when the project was already deleted.
 */
export async function cleanupProject(page: Page, projectId: string): Promise<void> {
  try {
    await page.request.delete(`${API_URL}/api/projects/${projectId}`);
  } catch {
    // ignore — best-effort cleanup
  }
}

/**
 * Archives a project via the API using the browser's shared cookie jar.
 */
export async function archiveProject(page: Page, projectId: string): Promise<void> {
  const response = await page.request.post(`${API_URL}/api/projects/${projectId}/archive`);
  if (!response.ok()) {
    throw new Error(`archiveProject failed: ${response.status()} ${await response.text()}`);
  }
}
