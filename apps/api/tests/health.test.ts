import { buildServer } from '../src/index';
import { healthRoute } from '../src/routes/health';
import { setupTestEnvironment } from './helpers/test-environment';

describe('Health endpoint', () => {
  beforeAll(() => {
    setupTestEnvironment();
  });

  test('GET /health returns 200 with status ok', async () => {
    const app = await buildServer();
    await app.register(healthRoute);
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('Error handling', () => {
  beforeAll(() => {
    setupTestEnvironment();
  });

  test('GET /nonexistent returns structured JSON 404', async () => {
    const app = await buildServer();
    const response = await app.inject({
      method: 'GET',
      url: '/nonexistent',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toHaveProperty('error');
    expect(response.json().error).toHaveProperty('code', 'NOT_FOUND');
    expect(response.json().error).toHaveProperty('message');
  });
});
