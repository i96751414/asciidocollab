import type { FastifyInstance } from 'fastify';
import { UserId, LogoutUseCase } from '@asciidocollab/domain';
import { requestContextFrom } from '../lib/request-context';
import '../types/session';
import type { AuthSuccessResponseDto } from '@asciidocollab/shared';

/**
 * Registers the logout route.
 *
 * @param app - The Fastify instance to register the route on.
 */
export async function logoutRoute(app: FastifyInstance): Promise<void> {
  app.post('/auth/logout', async (request, reply) => {
    // Capture the actor before the session is destroyed.
    const actorId = request.session.userId;

    await new Promise<void>((resolve, reject) => {
      request.session.destroy((error?: unknown) => {
        if (error) reject(error);
        else resolve();
      });
    });

    reply.clearCookie('sessionId');

    if (actorId) {
      // Best-effort: a failed audit write must never fail logout.
      try {
        await new LogoutUseCase(request.server.repos.auditLog).execute(
          UserId.create(actorId),
          requestContextFrom(request),
        );
      } catch (error) {
        request.log.warn({ error }, 'failed to record auth.signed_out audit event');
      }
    }

    return reply.status(200).send({ message: 'Logged out' } satisfies AuthSuccessResponseDto);
  });
}
