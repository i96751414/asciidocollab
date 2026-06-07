import { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { AuditLog, AuditLogId, UserId } from '@asciidocollab/domain';
import { requireAuth, getAuthenticatedUserId } from '../../plugins/require-auth';

/** Registers the POST /admin/access-denied route. */
export async function accessDeniedRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { resource: string } }>('/admin/access-denied', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['resource'],
        properties: {
          resource: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const userId = UserId.create(getAuthenticatedUserId(request));
    const { resource } = request.body;

    await request.server.repos.auditLog.save(
      new AuditLog(
        AuditLogId.create(randomUUID()),
        userId,
        null,
        'UNAUTHORIZED_PAGE_ACCESS',
        'PAGE',
        resource,
      ),
    );

    return reply.status(204).send();
  });
}
