import Fastify from 'fastify';
import { httpsRedirectPluginWrapped } from '../../src/plugins/https-redirect';

function buildApp(config: { httpsRedirect: boolean; trustProxy: boolean }) {
  const app = Fastify();
  app.decorate('config', { api: config } as never);
  app.register(httpsRedirectPluginWrapped);
  app.get('/test', (_req, reply) => reply.status(200).send('ok'));
  return app;
}

describe('httpsRedirectPlugin', () => {
  it('does not redirect when httpsRedirect is disabled', async () => {
    const app = buildApp({ httpsRedirect: false, trustProxy: false });
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(200);
  });

  it('redirects http to https when trustProxy=false (uses request.protocol)', async () => {
    const app = buildApp({ httpsRedirect: true, trustProxy: false });
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { host: 'example.com' },
    });
    expect(res.statusCode).toBe(301);
    expect(res.headers.location).toContain('https://example.com/test');
  });

  it('redirects when trustProxy=true and X-Forwarded-Proto is http', async () => {
    const app = buildApp({ httpsRedirect: true, trustProxy: true });
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { host: 'example.com', 'x-forwarded-proto': 'http' },
    });
    expect(res.statusCode).toBe(301);
    expect(res.headers.location).toContain('https://example.com/test');
  });

  it('does not redirect when trustProxy=true and X-Forwarded-Proto is https', async () => {
    const app = buildApp({ httpsRedirect: true, trustProxy: true });
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('falls back to request.protocol when X-Forwarded-Proto is absent (trustProxy=true)', async () => {
    const app = buildApp({ httpsRedirect: true, trustProxy: true });
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { host: 'example.com' },
    });
    // No X-Forwarded-Proto → typeof undefined !== 'string' → uses request.protocol ('http') → redirect
    expect(res.statusCode).toBe(301);
  });
});
