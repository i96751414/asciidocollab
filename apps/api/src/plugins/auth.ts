import fp from 'fastify-plugin';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import type { FastifyInstance } from 'fastify';

function isValidSameSite(value: string): 'strict' | 'lax' | 'none' {
  if (value === 'strict' || value === 'lax' || value === 'none') {
    return value;
  }
  return 'lax';
}

async function authPlugin(app: FastifyInstance): Promise<void> {
  await app.register(fastifyCookie);

  const store = app.services?.prismaSessionStore;

  const sessionSecret = app.config.auth.session.secret;
  if (!sessionSecret) {
    throw new Error(
      'ASCIIDOCOLLAB_AUTH_SESSION_SECRET must be set via environment variable.',
    );
  }

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
