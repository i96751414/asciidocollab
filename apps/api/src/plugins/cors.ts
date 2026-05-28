import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

async function corsPlugin(app: FastifyInstance): Promise<void> {
  const origins = process.env.ASCIIDOCOLLAB_API_CORS_ORIGINS?.split(',').map((o) => o.trim()) ?? [];

  await app.register(cors, {
    origin: origins.length > 0 ? origins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
}

export const corsPluginWrapped = fp(corsPlugin, {
  name: 'cors-plugin',
});
