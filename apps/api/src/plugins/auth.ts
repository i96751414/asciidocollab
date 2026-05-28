import fp from 'fastify-plugin';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import type { FastifyInstance } from 'fastify';
import { PrismaSessionStore } from '../services/session-store';

function isValidSameSite(value: string): 'strict' | 'lax' | 'none' {
  if (value === 'strict' || value === 'lax' || value === 'none') {
    return value;
  }
  return 'lax';
}

async function authPlugin(app: FastifyInstance): Promise<void> {
  await app.register(fastifyCookie);

  const store = app.prisma ? new PrismaSessionStore(app.prisma) : undefined;

  const sessionSecret = app.config.auth.session.secret;

  await app.register(fastifySession, {
    store,
    secret: sessionSecret,
    cookie: {
      secure: app.config.auth.session.secure,
      maxAge: app.config.auth.session.maxAge,
      httpOnly: app.config.auth.session.cookie.httpOnly,
      sameSite: isValidSameSite(app.config.auth.session.cookie.sameSite),
    },
    saveUninitialized: app.config.auth.session.cookie.saveUninitialized,
    rolling: app.config.auth.session.cookie.rolling,
  });
}

export const authPluginWrapped = fp(authPlugin, {
  name: 'auth-plugin',
});
