import type { FastifyInstance } from 'fastify';
import { ListFailedSignInAttemptsUseCase, UserId } from '@asciidocollab/domain';
import { requireAuth, getAuthenticatedUserId } from '../../plugins/require-auth';
import { requireAdmin } from '../../plugins/require-admin';
import '../../types/session';

/**
 * Registers the admin failed-sign-in telemetry review route (FR-032). Separate
 * from `/admin/audit-logs` so the governance and telemetry stores stay distinct.
 */
export async function failedSignInsRoute(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: {
      /** Filter by attempted identifier. */
      identifier?: string;
      /** Filter by request origin. */
      ipAddress?: string;
      /** ISO 8601 start of the window-start range. */
      fromDate?: string;
      /** ISO 8601 end of the window-start range. */
      toDate?: string;
      /** 1-based page number (default 1). */
      page?: number;
      /** Results per page (default 50). */
      limit?: number;
    };
  }>('/admin/failed-sign-ins', {
    preHandler: [requireAuth, requireAdmin],
    config: {
      rateLimit: {
        max: app.config.failedSignIn.rateLimitMax,
        timeWindow: app.config.failedSignIn.rateLimitWindow,
      },
    },
  }, async (request, reply) => {
    const { identifier, ipAddress, fromDate, toDate, page = 1, limit = 50 } = request.query;

    const actorId = UserId.create(getAuthenticatedUserId(request));
    const useCase = new ListFailedSignInAttemptsUseCase(
      request.server.repos.authAttemptTelemetry,
      request.server.repos.user,
    );

    const filters = {
      identifier,
      ipAddress,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
    };

    const result = await useCase.execute(actorId, filters, { page: Number(page), limit: Number(limit) });

    if (!result.success) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: result.error.message } });
    }

    return reply.status(200).send({
      items: result.value.items.map((attempt) => ({
        id: attempt.id.value,
        identifier: attempt.identifier,
        ipAddress: attempt.ipAddress,
        userAgent: attempt.userAgent,
        windowStart: attempt.windowStart.toISOString(),
        attemptCount: attempt.attemptCount,
        firstAttemptAt: attempt.firstAttemptAt.toISOString(),
        lastAttemptAt: attempt.lastAttemptAt.toISOString(),
      })),
      total: result.value.total,
      page: result.value.page,
      limit: result.value.limit,
    });
  });
}
