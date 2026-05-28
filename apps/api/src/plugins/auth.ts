import fp from 'fastify-plugin';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import type { FastifyInstance } from 'fastify';
import { PrismaSessionStore } from '../services/session-store';

async function authPlugin(app: FastifyInstance): Promise<void> {
  await app.register(fastifyCookie);

  const store = app.prisma ? new PrismaSessionStore(app.prisma) : undefined;

  const sessionSecret = process.env.ASCIIDOCOLLAB_AUTH_SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error('ASCIIDOCOLLAB_AUTH_SESSION_SECRET is required');
  }

  await app.register(fastifySession, {
    store,
    secret: sessionSecret,
    cookie: {
      secure: process.env.ASCIIDOCOLLAB_AUTH_COOKIE_SECURE !== 'false',
      maxAge: parseInt(process.env.ASCIIDOCOLLAB_AUTH_SESSION_MAX_AGE ?? '1800000', 10),
      httpOnly: true,
      sameSite: 'lax',
    },
    saveUninitialized: false,
    rolling: true,
  });
}

export const authPluginWrapped = fp(authPlugin, {
  name: 'auth-plugin',
});
