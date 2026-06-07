/**
 * Unit tests for apps/web/e2e/helpers/test-user.ts
 *
 * The `ensureTestUser` function is tested by mocking the @playwright/test `request`
 * module so tests never hit a real server.
 */

// Must be declared before the import that uses it so Jest's hoisting works.
jest.mock('@playwright/test', () => ({
  request: {
    newContext: jest.fn(),
  },
}));

import { ensureTestUser } from '../../e2e/helpers/test-user';

const mockNewContext = jest.requireMock('@playwright/test').request
  .newContext as jest.Mock;

function makeContext(registerStatus: number, loginStatus?: number) {
  const mockDispose = jest.fn().mockResolvedValue(undefined);
  const mockPost = jest.fn();

  mockPost.mockResolvedValueOnce({
    status: () => registerStatus,
    ok: () => registerStatus >= 200 && registerStatus < 300,
  });

  if (loginStatus !== undefined) {
    mockPost.mockResolvedValueOnce({
      status: () => loginStatus,
      ok: () => loginStatus >= 200 && loginStatus < 300,
    });
  }

  return { post: mockPost, dispose: mockDispose };
}

beforeEach(() => {
  mockNewContext.mockClear();
});

describe('ensureTestUser', () => {
  it('resolves when /auth/register returns 201', async () => {
    mockNewContext.mockResolvedValue(makeContext(201));
    await expect(ensureTestUser()).resolves.toBeUndefined();
  });

  it('resolves when register returns 403 and login succeeds (200)', async () => {
    mockNewContext.mockResolvedValue(makeContext(403, 200));
    await expect(ensureTestUser()).resolves.toBeUndefined();
  });

  it('throws a descriptive error when register returns 403 and login fails (401)', async () => {
    mockNewContext.mockResolvedValue(makeContext(403, 401));
    await expect(ensureTestUser()).rejects.toThrow(/registration is closed/);
  });

  it('throws when /auth/register returns an unexpected 500 status', async () => {
    mockNewContext.mockResolvedValue(makeContext(500));
    await expect(ensureTestUser()).rejects.toThrow();
  });

  it('throws when /auth/register returns an unexpected 400 status', async () => {
    mockNewContext.mockResolvedValue(makeContext(400));
    await expect(ensureTestUser()).rejects.toThrow();
  });

  it('throws when /auth/register returns 409 (conflict)', async () => {
    mockNewContext.mockResolvedValue(makeContext(409));
    await expect(ensureTestUser()).rejects.toThrow();
  });

  it('always calls context.dispose() even when an error is thrown', async () => {
    const context = makeContext(500);
    mockNewContext.mockResolvedValue(context);
    await expect(ensureTestUser()).rejects.toThrow();
    expect(context.dispose).toHaveBeenCalledTimes(1);
  });
});
