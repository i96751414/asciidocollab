import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

async function rateLimitPlugin(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: false,
  });
}

export const rateLimitPluginWrapped = fp(rateLimitPlugin, {
  name: 'rate-limit-plugin',
});
