import Fastify, { FastifyError } from 'fastify';
import { errorHandler, notFoundHandler } from '../../src/plugins/error-handler';

function buildTestServer(throwValue: unknown) {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  app.get('/error', async () => {
    throw throwValue;
  });
  return app;
}

describe('errorHandler', () => {
  it('returns 500 INTERNAL_ERROR for a plain Error (no statusCode)', async () => {
    const app = buildTestServer(new Error('boom'));
    const res = await app.inject({ method: 'GET', url: '/error' });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error.code).toBe('INTERNAL_ERROR');
  });

  it('returns 400 VALIDATION_ERROR for a FastifyError with statusCode 400', async () => {
    const err = Object.assign(new Error('bad input'), { statusCode: 400 }) as FastifyError;
    const app = buildTestServer(err);
    const res = await app.inject({ method: 'GET', url: '/error' });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 429 RATE_LIMITED with retryAfter from headers', async () => {
    const err = Object.assign(new Error('too many'), {
      statusCode: 429,
      headers: { 'retry-after': '30' },
    }) as FastifyError;
    const app = buildTestServer(err);
    const res = await app.inject({ method: 'GET', url: '/error' });
    expect(res.statusCode).toBe(429);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.retryAfter).toBe(30);
  });

  it('returns retryAfter=60 when headers is missing', async () => {
    const err = Object.assign(new Error('too many'), { statusCode: 429 }) as FastifyError;
    const app = buildTestServer(err);
    const res = await app.inject({ method: 'GET', url: '/error' });
    expect(JSON.parse(res.body).error.retryAfter).toBe(60);
  });

  it('returns retryAfter=60 when headers is not an object', async () => {
    const err = Object.assign(new Error('too many'), { statusCode: 429, headers: 'bad' }) as FastifyError;
    const app = buildTestServer(err);
    const res = await app.inject({ method: 'GET', url: '/error' });
    expect(JSON.parse(res.body).error.retryAfter).toBe(60);
  });

  it('returns retryAfter=60 when retry-after key is absent', async () => {
    const err = Object.assign(new Error('too many'), { statusCode: 429, headers: {} }) as FastifyError;
    const app = buildTestServer(err);
    const res = await app.inject({ method: 'GET', url: '/error' });
    expect(JSON.parse(res.body).error.retryAfter).toBe(60);
  });

  it('returns retryAfter=60 when retry-after value is not a finite number', async () => {
    const err = Object.assign(new Error('too many'), {
      statusCode: 429,
      headers: { 'retry-after': 'abc' },
    }) as FastifyError;
    const app = buildTestServer(err);
    const res = await app.inject({ method: 'GET', url: '/error' });
    expect(JSON.parse(res.body).error.retryAfter).toBe(60);
  });
});

describe('notFoundHandler', () => {
  it('returns 404 NOT_FOUND for unknown routes', async () => {
    const app = buildTestServer(new Error('unused'));
    const res = await app.inject({ method: 'GET', url: '/nonexistent-route' });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('NOT_FOUND');
  });
});
