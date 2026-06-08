import Fastify from 'fastify';
import {
  SendUserInvitationUseCase,
  DuplicateEmailError,
  InvitationAlreadyPendingError,
  PermissionDeniedError,
} from '@asciidocollab/domain';
import { usersInviteRoute } from '../../../src/routes/admin/users-invite';

jest.mock('../../../src/plugins/require-auth', () => ({
  requireAuth: jest.fn((_request: unknown, _rep: unknown, done: () => void) => done()),
  getAuthenticatedUserId: jest.fn(() => '550e8400-e29b-41d4-a716-446655440001'),
}));

jest.mock('../../../src/plugins/require-admin', () => ({
  requireAdmin: jest.fn((_request: unknown, _rep: unknown, done: () => void) => done()),
}));

function buildTestServer() {
  const app = Fastify();
  app.decorate('repos', {
    user: { findById: jest.fn().mockResolvedValue({ displayName: 'Admin' }) },
    userInvitation: { findByEmail: jest.fn(), save: jest.fn() },
    auditLog: { save: jest.fn() },
  });
  app.decorate('services', {
    tokenGenerator: { generateInvitationToken: jest.fn(), hashToken: jest.fn() },
    registrationInvitationNotifier: { sendInvitationEmail: jest.fn() },
  });
  app.decorate('config', {
    admin: { invite: { rateLimitMax: 100, rateLimitWindow: 60_000 } },
  });
  app.register(usersInviteRoute);
  return app;
}

describe('POST /admin/users/invite', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 202 on success', async () => {
    jest.spyOn(SendUserInvitationUseCase.prototype, 'execute').mockResolvedValue({
      success: true,
      value: undefined,
    });

    const app = buildTestServer();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/invite',
      payload: { email: 'new@example.com' },
    });

    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).message).toBe('Invitation sent');
  });

  it('returns 409 DUPLICATE_EMAIL when email is already registered', async () => {
    jest.spyOn(SendUserInvitationUseCase.prototype, 'execute').mockResolvedValue({
      success: false,
      error: new DuplicateEmailError('new@example.com'),
    });

    const app = buildTestServer();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/invite',
      payload: { email: 'new@example.com' },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('DUPLICATE_EMAIL');
  });

  it('returns 409 INVITATION_ALREADY_PENDING', async () => {
    jest.spyOn(SendUserInvitationUseCase.prototype, 'execute').mockResolvedValue({
      success: false,
      error: new InvitationAlreadyPendingError('pending@example.com'),
    });

    const app = buildTestServer();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/invite',
      payload: { email: 'pending@example.com' },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('INVITATION_ALREADY_PENDING');
  });

  it('returns 403 PERMISSION_DENIED', async () => {
    jest.spyOn(SendUserInvitationUseCase.prototype, 'execute').mockResolvedValue({
      success: false,
      error: new PermissionDeniedError(),
    });

    const app = buildTestServer();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/invite',
      payload: { email: 'denied@example.com' },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('PERMISSION_DENIED');
  });

  it('falls back to "Administrator" when actor user is not found', async () => {
    jest.spyOn(SendUserInvitationUseCase.prototype, 'execute').mockResolvedValue({
      success: true,
      value: undefined,
    });

    const app = buildTestServer();
    (app as unknown as { repos: { user: { findById: jest.Mock } } }).repos.user.findById.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/invite',
      payload: { email: 'new@example.com' },
    });

    expect(res.statusCode).toBe(202);
  });
});
