import type { FastifyInstance } from 'fastify';
import { ListAuditLogsUseCase, UserId } from '@asciidocollab/domain';
import { requireAuth, getAuthenticatedUserId } from '../../plugins/require-auth';
import { requireAdmin } from '../../plugins/require-admin';
import type { AuditLogPageDto } from '@asciidocollab/shared';
import '../../types/session';

/** Registers admin audit-log routes: paginated listing and distinct action-type enumeration. */
export async function auditLogsRoute(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: {
      /** ISO 8601 start of time range filter. */
      fromDate?: string;
      /** ISO 8601 end of time range filter. */
      toDate?: string;
      /** Filter by actor user ID. */
      userId?: string;
      /** Filter by action type string. */
      actionType?: string;
      /** 1-based page number (default 1). */
      page?: number;
      /** Results per page (default 50). */
      limit?: number;
    };
  }>('/admin/audit-logs', {
    preHandler: [requireAuth, requireAdmin],
    config: {
      rateLimit: {
        max: app.config.admin.auditLog.rateLimitMax,
        timeWindow: app.config.admin.auditLog.rateLimitWindow,
      },
    },
  }, async (request, reply) => {
    const { fromDate, toDate, userId, actionType, page = 1, limit = 50 } = request.query;

    const actorId = UserId.create(getAuthenticatedUserId(request));
    const useCase = new ListAuditLogsUseCase(
      request.server.repos.auditLog,
      request.server.repos.user,
    );

    const filters = {
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      userId,
      actionType,
    };

    const result = await useCase.execute(actorId, filters, { page: Number(page), limit: Number(limit) });

    if (!result.success) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: result.error.message } });
    }

    const dto: AuditLogPageDto = {
      items: result.value.items.map((log) => ({
        id: log.id.value,
        userId: log.userId?.value ?? null,
        actorDisplayName: null,
        projectId: log.projectId?.value ?? null,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        timestamp: log.timestamp.toISOString(),
        metadata: log.metadata,
      })),
      total: result.value.total,
      page: result.value.page,
      limit: result.value.limit,
    };

    return reply.status(200).send(dto);
  });

  app.get('/admin/audit-logs/action-types', {
    preHandler: [requireAuth, requireAdmin],
    config: {
      rateLimit: {
        max: app.config.admin.auditLog.rateLimitMax,
        timeWindow: app.config.admin.auditLog.rateLimitWindow,
      },
    },
  }, async (request, reply) => {
    const actionTypes = await request.server.repos.auditLog.findDistinctActionTypes();
    return reply.status(200).send({ actionTypes });
  });
}
