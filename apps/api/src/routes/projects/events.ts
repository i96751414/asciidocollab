import type { FastifyInstance } from 'fastify';
import {
  UserId,
  ProjectId,
} from '@asciidocollab/domain';
import { getAuthenticatedUserId } from '../../plugins/require-auth';
import type { FileTreeEventDto } from '@asciidocollab/shared';

const KEEPALIVE_INTERVAL_MS = 30_000;

/** Registers the SSE endpoint for file tree events. */
export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string } }>(
    '/projects/:projectId/events',
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);

      const member = await request.server.repos.projectMember.findByCompositeKey(projectId, actorId);
      if (!member) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not a project member' } });
      }

      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('X-Accel-Buffering', 'no');

      // Fastify stores headers (e.g. CORS) in reply[kReplyHeaders], separate from reply.raw.
      // reply.raw.flushHeaders() bypasses Fastify's normal reply.send() path, so Fastify's
      // headers never reach reply.raw unless we flush them explicitly first.
      const fastifyHeaders = reply.getHeaders();
      for (const [name, value] of Object.entries(fastifyHeaders)) {
        if (value !== undefined) {
          reply.raw.setHeader(name, value as string | string[] | number);
        }
      }

      reply.raw.flushHeaders();

      const sendEvent = (event: FileTreeEventDto) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const unsubscribe = request.server.fileTreeEventBus.subscribe(projectId.value, sendEvent);

      const keepalive = setInterval(() => {
        reply.raw.write(': keepalive\n\n');
      }, KEEPALIVE_INTERVAL_MS).unref();

      request.raw.on('close', () => {
        clearInterval(keepalive);
        unsubscribe();
      });

      await new Promise<void>((resolve) => request.raw.on('close', resolve));
      return reply;
    },
  );
}
