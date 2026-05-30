import fp from 'fastify-plugin';
import csrfProtection from '@fastify/csrf-protection';
import type { FastifyInstance } from 'fastify';

async function csrfPlugin(app: FastifyInstance): Promise<void> {
  await app.register(csrfProtection, {
    sessionPlugin: '@fastify/cookie',
    cookieKey: '_csrf',
    cookieOpts: { path: '/', sameSite: true, httpOnly: false },
  });
}

export const csrfPluginWrapped = fp(csrfPlugin, {
  name: 'csrf-plugin',
});
