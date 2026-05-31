import { request } from '@playwright/test';

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
    const csrfResponse = await context.get('/auth/csrf-token');
    const { token } = await csrfResponse.json();
    await context.post('/auth/register', {
      headers: { 'x-csrf-token': token },
      data: TEST_USER,
    });
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
