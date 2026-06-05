import Fastify from 'fastify';
import { editorPreferencesRoutes } from '../../src/routes/editor-preferences';

jest.mock('../../src/plugins/require-auth', () => ({
  requireAuth: jest.fn((_req: unknown, _rep: unknown, done: () => void) => done()),
  getAuthenticatedUserId: jest.fn(() => '550e8400-e29b-41d4-a716-446655440001'),
}));

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';

function buildTestServer(
  storedPrefs: { fontSize: number; theme: string } | null = null
) {
  const app = Fastify();

  let currentPrefs = storedPrefs;
  app.decorate('repos', {
    editorPreferences: {
      findByUserId: jest.fn().mockImplementation(() =>
        currentPrefs
          ? {
              id: { value: '660e8400-e29b-41d4-a716-446655440001' },
              userId: { value: USER_ID },
              fontSize: currentPrefs.fontSize,
              theme: { value: currentPrefs.theme },
            }
          : null
      ),
      save: jest.fn().mockImplementation((prefs: { fontSize: number; theme: { value: string } }) => {
        currentPrefs = { fontSize: prefs.fontSize, theme: prefs.theme.value };
      }),
    },
  });

  app.register(editorPreferencesRoutes);
  return app;
}

describe('Editor Preferences Routes', () => {
  test('GET /auth/me/editor-preferences returns defaults when no record exists', async () => {
    const app = buildTestServer(null);
    const res = await app.inject({ method: 'GET', url: '/auth/me/editor-preferences' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('fontSize');
    expect(body).toHaveProperty('theme');
    expect(body.fontSize).toBe(14);
    expect(body.theme).toBe('default');
  });

  test('GET /auth/me/editor-preferences returns saved values after a PUT', async () => {
    const app = buildTestServer({ fontSize: 20, theme: 'high-contrast' });
    const res = await app.inject({ method: 'GET', url: '/auth/me/editor-preferences' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.fontSize).toBe(20);
    expect(body.theme).toBe('high-contrast');
  });

  test('PUT /auth/me/editor-preferences with valid body returns 204', async () => {
    const app = buildTestServer(null);
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/me/editor-preferences',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fontSize: 18, theme: 'default' }),
    });
    expect(res.statusCode).toBe(204);
  });

  test('PUT /auth/me/editor-preferences with fontSize: 7 returns 400', async () => {
    const app = buildTestServer(null);
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/me/editor-preferences',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fontSize: 7, theme: 'default' }),
    });
    expect(res.statusCode).toBe(400);
  });

  test('PUT /auth/me/editor-preferences with theme: "neon" returns 400', async () => {
    const app = buildTestServer(null);
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/me/editor-preferences',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fontSize: 14, theme: 'neon' }),
    });
    expect(res.statusCode).toBe(400);
  });

  test('GET returns 401 when unauthenticated', async () => {
    const { requireAuth } = jest.requireMock('../../src/plugins/require-auth');
    requireAuth.mockImplementationOnce(
      (_req: unknown, rep: { status: (n: number) => { send: (b: unknown) => void } }, _done: () => void) => {
        rep.status(401).send({ error: 'Unauthorized' });
      }
    );
    const app = buildTestServer(null);
    const res = await app.inject({ method: 'GET', url: '/auth/me/editor-preferences' });
    expect(res.statusCode).toBe(401);
  });
});
