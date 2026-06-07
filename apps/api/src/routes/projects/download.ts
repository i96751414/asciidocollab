import type { FastifyInstance } from 'fastify';
import archiver from 'archiver';
import {
  DownloadProjectUseCase,
  PermissionDeniedError,
  ProjectNotFoundError,
  UserId,
  ProjectId,
} from '@asciidocollab/domain';
import { requireAuth, getAuthenticatedUserId } from '../../plugins/require-auth';

/** Streams a ZIP archive of all project files. */
export async function projectDownloadRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string } }>(
    '/projects/:projectId/download',
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: app.config.downloads.zip.rateLimitMax,
          timeWindow: app.config.downloads.zip.rateLimitWindow,
        },
      },
    },
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);

      const useCase = new DownloadProjectUseCase(
        request.server.repos.project,
        request.server.repos.fileNode,
        request.server.repos.projectMember,
      );

      const result = await useCase.execute(actorId, projectId);

      if (!result.success) {
        const { error } = result;
        if (error instanceof PermissionDeniedError) {
          return reply.status(403).send({ error: { code: 'FORBIDDEN', message: error.message } });
        }
        if (error instanceof ProjectNotFoundError) {
          return reply.status(404).send({ error: { code: 'PROJECT_NOT_FOUND', message: error.message } });
        }
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } });
      }

      const { projectName, files } = result.value;
      const date = new Date().toISOString().slice(0, 10);
      const filename = `${projectName}-${date}.zip`;

      reply.raw.setHeader('Content-Type', 'application/zip');
      reply.raw.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.pipe(reply.raw);

      for (const { fileNode, relativePath } of files) {
        const stream = await request.server.stores.fileStore.readStream(projectId, fileNode.path);
        if (stream === null) {
          // Filesystem/DB desync — skip file with a warning
          app.log.warn({ projectId: projectId.value, path: fileNode.path.value }, 'file missing from store during ZIP; skipping');
          continue;
        }
        archive.append(stream, { name: relativePath });
      }

      await archive.finalize();
      return reply;
    },
  );
}
