import type { FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import path from 'node:path';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Prefix of the sentinel file the collaboration server drops into its storage root to probe sharing. */
export const STORAGE_PROBE_PREFIX = '.collab-storage-probe-';

/**
 * Registers the internal storage-consistency probe.
 *
 * Collaboration persistence REQUIRES the API and the collaboration server to share
 * one physical file-storage root: the collab server writes document edits back to
 * storage and the API serves them via GET /content and downloads. If the two
 * processes use different roots, edits silently never reach the REST source of
 * truth and the sides overwrite each other (data loss). At startup the collab
 * server drops a uniquely-named sentinel into its own storage root and calls this
 * endpoint to confirm the SAME file is visible under the API's storage root,
 * detecting physical sharing even when the two resolve the root to different
 * path strings (for example, a shared network mount).
 */
export async function storageProbeRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { token: string } }>(
    '/internal/collab/storage-probe',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const { token } = request.query;
      // The token names a file under our storage root, so reject anything but a UUID to
      // foreclose path traversal (`..`, separators) before touching the filesystem.
      if (!UUID_REGEX.test(token)) {
        return reply.status(400).send({ error: 'Invalid token' });
      }
      const storageRoot = request.server.config.storage.path;
      const sentinel = path.resolve(storageRoot, `${STORAGE_PROBE_PREFIX}${token}`);
      return reply.status(200).send({ shared: existsSync(sentinel) });
    },
  );
}
