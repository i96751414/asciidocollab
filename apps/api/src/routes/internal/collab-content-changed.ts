import type { FastifyInstance } from 'fastify';
import { YjsStateId } from '@asciidocollab/domain';
import { COLLAB_CONTENT_CHANGED_PATH } from '@asciidocollab/shared';

const uuidProperty = { type: 'string', format: 'uuid' } as const;

/**
 * Registers the internal content-changed notify endpoint the collaboration server calls on a
 * debounced live edit. It maps the room's `yjsStateId` to the owning file node and broadcasts a
 * `content-changed` event on the project's SSE stream so open dependents recompute (research D2/D4).
 *
 * Runs on the internal server (loopback plus optional mTLS), so that trust boundary is the primary
 * protection; the route carries no content — only the file id — and is intentionally not
 * rate-limited, consistent with the other internal routes.
 */
export async function collabContentChangedRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { projectId: string; yjsStateId: string } }>(
    COLLAB_CONTENT_CHANGED_PATH,
    {
      schema: {
        body: {
          type: 'object',
          required: ['projectId', 'yjsStateId'],
          properties: { projectId: uuidProperty, yjsStateId: uuidProperty },
        },
      },
    },
    async (request, reply) => {
      const { projectId, yjsStateId } = request.body;

      // Thin id mapping only (delivery tier): an unknown room has nothing to notify, so ack without
      // emitting rather than erroring — the collab server treats this as best-effort.
      const document = await request.server.repos.document.findByYjsStateId(YjsStateId.create(yjsStateId));
      if (document) {
        request.server.fileTreeEventBus.emit(projectId, {
          type: 'content-changed',
          fileNodeId: document.fileNodeId.value,
        });
      }

      return reply.status(200).send({ ok: true });
    },
  );
}
