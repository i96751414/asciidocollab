import type { FastifyInstance } from 'fastify';
import { ProjectId } from '@asciidocollab/domain';
import { getAuthenticatedUserId } from '../../plugins/require-auth';

/**
 * Registers the user search route.
 *
 * GET /api/users/search?q=query&excludeProjectId=id.
 */
export async function usersSearchRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { q?: string; excludeProjectId?: string } }>('/api/users/search', {
    config: {
      rateLimit: {
        max: app.config.auth.userSearch.rateLimitMax,
        timeWindow: app.config.auth.userSearch.rateLimitWindow,
      },
    },
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          excludeProjectId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    getAuthenticatedUserId(request); // asserts session is valid; result unused here

    const { q, excludeProjectId } = request.query;

    if (!q || q.length < 2) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Query parameter "q" must be at least 2 characters' },
      });
    }

    const projectIdValue = excludeProjectId ? ProjectId.create(excludeProjectId) : undefined;
    const users = await request.server.repos.user.search(q, projectIdValue);

    return reply.status(200).send({
      data: {
        users: users.map((u) => ({
          userId: u.id.value,
          displayName: u.displayName,
          email: u.email.value,
        })),
      },
    });
  });
}
