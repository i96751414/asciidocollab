import type { FastifyInstance } from 'fastify';
import { AcceptUserInvitationUseCase } from '@asciidocollab/domain';
import type { AcceptInviteDto } from '@asciidocollab/shared';
import '../types/session';

/** Registers the accept invite route on the Fastify instance. */
export async function acceptInviteRoute(app: FastifyInstance): Promise<void> {
  // GET /auth/accept-invite?token=... — preview: returns recipient email if valid
  app.get<{ Querystring: { token?: string } }>('/auth/accept-invite', async (request, reply) => {
    const { token } = request.query;
    if (!token) {
      return reply.status(400).send({ error: { code: 'INVALID_TOKEN', message: 'Token is required' } });
    }

    const tokenHash = request.server.services.tokenGenerator.hashToken(token);
    const invitation = await request.server.repos.userInvitation.findByTokenHash(tokenHash);

    if (!invitation || !invitation.isValid) {
      return reply.status(400).send({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired invitation' } });
    }

    return reply.status(200).send({ email: invitation.recipientEmail.value });
  });

  // POST /auth/accept-invite — complete registration
  app.post<{ Body: AcceptInviteDto }>('/auth/accept-invite', {
    config: {
      rateLimit: {
        max: app.config.auth.invitation.rateLimitMax,
        timeWindow: app.config.auth.invitation.rateLimitWindow,
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['token', 'displayName', 'password'],
        properties: {
          token: { type: 'string' },
          displayName: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { token, displayName, password } = request.body;

    const appConfig = request.server.config;
    const passwordPolicy = {
      minLength: appConfig.auth.password.minLength,
      requireUppercase: appConfig.auth.password.requireUppercase,
      requireLowercase: appConfig.auth.password.requireLowercase,
      requireDigits: appConfig.auth.password.requireDigits,
      requireSymbols: appConfig.auth.password.requireSymbols,
    };

    const useCase = new AcceptUserInvitationUseCase(
      request.server.repos.user,
      request.server.repos.userInvitation,
      request.server.repos.auditLog,
      request.server.services.tokenGenerator,
      request.server.services.passwordHasher,
      passwordPolicy,
      request.server.services.commonPasswordChecker,
      request.server.services.breachChecker,
    );

    const result = await useCase.execute(token, displayName, password);

    if (!result.success) {
      const errorName = result.error.name;
      if (errorName === 'InvalidTokenError') {
        return reply.status(400).send({ error: { code: 'INVALID_TOKEN', message: result.error.message } });
      }
      if (errorName === 'DuplicateEmailError') {
        return reply.status(409).send({ error: { code: 'DUPLICATE_EMAIL', message: result.error.message } });
      }
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: result.error.message } });
    }

    request.session.userId = result.value.userId.value;
    request.session.emailVerified = true;
    request.session.isAdmin = false;

    return reply.status(201).send({ message: 'Account created' });
  });
}
