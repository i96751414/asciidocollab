import Fastify from 'fastify';
import { GetEditorPreferencesUseCase, SaveEditorPreferencesUseCase } from '@asciidocollab/domain';
import { editorPreferencesRoutes } from '../../../../src/routes/auth/me/editor-preferences';

jest.mock('../../../../src/plugins/require-auth', () => ({
  requireAuth: jest.fn((_request: unknown, _rep: unknown, done: () => void) => done()),
  getAuthenticatedUserId: jest.fn(() => '550e8400-e29b-41d4-a716-446655440001'),
}));

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';

function buildTestServer(
  storedPrefs: { fontSize: number; theme: string; scrollSyncEnabled?: boolean; previewStyle?: string } | null = null
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
              scrollSyncEnabled: currentPrefs.scrollSyncEnabled ?? false,
              softWrap: true,
              previewStyle: { value: currentPrefs.previewStyle ?? 'asciidocollab' },
            }
          : null
      ),
      save: jest.fn().mockImplementation((prefs: { fontSize: number; theme: { value: string }; previewStyle: { value: string } }) => {
        currentPrefs = { fontSize: prefs.fontSize, theme: prefs.theme.value, previewStyle: prefs.previewStyle.value };
      }),
    },
  });

  app.register(editorPreferencesRoutes);
  return app;
}

describe('Editor Preferences Routes', () => {
  test('GET /auth/me/editor-preferences returns defaults when no record exists', async () => {
    const app = buildTestServer(null);
    const response = await app.inject({ method: 'GET', url: '/auth/me/editor-preferences' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('fontSize');
    expect(body).toHaveProperty('theme');
    expect(body.fontSize).toBe(14);
    expect(body.theme).toBe('default');
  });

  test('GET /auth/me/editor-preferences returns saved values after a PUT', async () => {
    const app = buildTestServer({ fontSize: 20, theme: 'high-contrast' });
    const response = await app.inject({ method: 'GET', url: '/auth/me/editor-preferences' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.fontSize).toBe(20);
    expect(body.theme).toBe('high-contrast');
  });

  test('PUT /auth/me/editor-preferences with valid body returns 204', async () => {
    const app = buildTestServer(null);
    const response = await app.inject({
      method: 'PUT',
      url: '/auth/me/editor-preferences',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fontSize: 18, theme: 'default' }),
    });
    expect(response.statusCode).toBe(204);
  });

  test('PUT /auth/me/editor-preferences with fontSize: 7 returns 400', async () => {
    const app = buildTestServer(null);
    const response = await app.inject({
      method: 'PUT',
      url: '/auth/me/editor-preferences',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fontSize: 7, theme: 'default' }),
    });
    expect(response.statusCode).toBe(400);
  });

  test('PUT /auth/me/editor-preferences with theme: "neon" returns 400', async () => {
    const app = buildTestServer(null);
    const response = await app.inject({
      method: 'PUT',
      url: '/auth/me/editor-preferences',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fontSize: 14, theme: 'neon' }),
    });
    expect(response.statusCode).toBe(400);
  });

  test('GET /auth/me/editor-preferences returns scrollSyncEnabled when record exists', async () => {
    const app = buildTestServer({ fontSize: 14, theme: 'default', scrollSyncEnabled: true });
    const response = await app.inject({ method: 'GET', url: '/auth/me/editor-preferences' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('scrollSyncEnabled', true);
  });

  test('GET /auth/me/editor-preferences returns scrollSyncEnabled: false as default', async () => {
    const app = buildTestServer(null);
    const response = await app.inject({ method: 'GET', url: '/auth/me/editor-preferences' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('scrollSyncEnabled', false);
  });

  test('GET returns previewStyle defaulting to asciidocollab when no record exists', async () => {
    const app = buildTestServer(null);
    const response = await app.inject({ method: 'GET', url: '/auth/me/editor-preferences' });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toHaveProperty('previewStyle', 'asciidocollab');
  });

  test('GET returns the stored previewStyle', async () => {
    const app = buildTestServer({ fontSize: 14, theme: 'default', previewStyle: 'asciidoctor' });
    const response = await app.inject({ method: 'GET', url: '/auth/me/editor-preferences' });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toHaveProperty('previewStyle', 'asciidoctor');
  });

  test('PUT with previewStyle: "asciidoctor" returns 204 and persists', async () => {
    const app = buildTestServer(null);
    const putResponse = await app.inject({
      method: 'PUT',
      url: '/auth/me/editor-preferences',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fontSize: 14, theme: 'default', previewStyle: 'asciidoctor' }),
    });
    expect(putResponse.statusCode).toBe(204);

    const getResponse = await app.inject({ method: 'GET', url: '/auth/me/editor-preferences' });
    expect(JSON.parse(getResponse.body)).toHaveProperty('previewStyle', 'asciidoctor');
  });

  test('PUT with an out-of-enum previewStyle returns 400', async () => {
    const app = buildTestServer(null);
    const response = await app.inject({
      method: 'PUT',
      url: '/auth/me/editor-preferences',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fontSize: 14, theme: 'default', previewStyle: 'Asciidocollab' }),
    });
    expect(response.statusCode).toBe(400);
  });

  test('GET returns 401 when unauthenticated', async () => {
    const { requireAuth } = jest.requireMock('../../../../src/plugins/require-auth');
    requireAuth.mockImplementationOnce(
      (_request: unknown, rep: { status: (n: number) => { send: (b: unknown) => void } }, _done: () => void) => {
        rep.status(401).send({ error: 'Unauthorized' });
      }
    );
    const app = buildTestServer(null);
    const response = await app.inject({ method: 'GET', url: '/auth/me/editor-preferences' });
    expect(response.statusCode).toBe(401);
  });
});

describe('Editor Preferences Routes — error paths', () => {
  afterEach(() => jest.restoreAllMocks());

  test('GET returns 500 when use case fails', async () => {
    jest.spyOn(GetEditorPreferencesUseCase.prototype, 'execute').mockResolvedValue({
      success: false,
      error: new Error('db error') as never,
    });
    const app = buildTestServer(null);
    const response = await app.inject({ method: 'GET', url: '/auth/me/editor-preferences' });
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error.code).toBe('INTERNAL_ERROR');
  });

  test('PUT returns 400 VALIDATION_ERROR when use case fails', async () => {
    jest.spyOn(SaveEditorPreferencesUseCase.prototype, 'execute').mockResolvedValue({
      success: false,
      error: new Error('invalid theme') as never,
    });
    const app = buildTestServer(null);
    const response = await app.inject({
      method: 'PUT',
      url: '/auth/me/editor-preferences',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fontSize: 14, theme: 'default' }),
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.code).toBe('VALIDATION_ERROR');
  });
});
