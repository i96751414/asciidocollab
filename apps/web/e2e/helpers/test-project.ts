import { Page } from '@playwright/test';
import { TEST_USER, createInvitedUser } from './test-user';

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

/**
 * Gets the root folder ID of a project's file tree.
 */
async function getProjectRootFolderId(page: Page, projectId: string): Promise<string> {
  const response = await page.request.get(`${API_URL}/projects/${projectId}/files`);
  if (!response.ok()) {
    throw new Error(`getProjectRootFolderId failed: ${response.status()} ${await response.text()}`);
  }
  const tree = await response.json();
  return tree.id;
}

/**
 * Creates a file node in a project's file tree via the API.
 * Returns the new file node's ID.
 */
export async function createTestFile(
  page: Page,
  projectId: string,
  parentId: string | null,
  name: string,
): Promise<string> {
  const resolvedParentId = parentId ?? await getProjectRootFolderId(page, projectId);
  const response = await page.request.post(`${API_URL}/projects/${projectId}/files`, {
    data: { type: 'file', parentId: resolvedParentId, name, mimeType: 'text/asciidoc' },
  });
  if (!response.ok()) {
    throw new Error(`createTestFile failed: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json();
  return body.fileNodeId;
}

/**
 * Creates a folder in a project's file tree via the API.
 * Returns the new folder's ID.
 */
export async function createTestFolder(
  page: Page,
  projectId: string,
  parentId: string | null,
  name: string,
): Promise<string> {
  const resolvedParentId = parentId ?? await getProjectRootFolderId(page, projectId);
  const response = await page.request.post(`${API_URL}/projects/${projectId}/files`, {
    data: { type: 'folder', parentId: resolvedParentId, name },
  });
  if (!response.ok()) {
    throw new Error(`createTestFolder failed: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json();
  return body.fileNodeId;
}

/**
 * Deletes a file node from a project's file tree via the API.
 */
export async function deleteTestFileNode(
  page: Page,
  projectId: string,
  fileNodeId: string,
): Promise<void> {
  try {
    await page.request.delete(`${API_URL}/projects/${projectId}/files/${fileNodeId}`);
  } catch {
    // ignore — best-effort cleanup
  }
}

export interface ViewerCredentials {
  email: string;
  password: string;
}

/**
 * Creates a viewer user and invites them to a project.
 * Returns the viewer's login credentials.
 */
export async function createViewerInProject(
  page: Page,
  projectId: string,
): Promise<ViewerCredentials> {
  const viewerEmail = `viewer-${Date.now()}@example.com`;
  const viewerPassword = 'ViewerP@ssw0rd123!';

  await createInvitedUser(page, viewerEmail, viewerPassword, 'Test Viewer');

  const inviteResp = await page.request.post(`${API_URL}/api/projects/${projectId}/members`, {
    data: { email: viewerEmail, role: 'viewer' },
  });
  if (!inviteResp.ok()) {
    throw new Error(`createViewerInProject failed: ${inviteResp.status()} ${await inviteResp.text()}`);
  }

  return { email: viewerEmail, password: viewerPassword };
}
