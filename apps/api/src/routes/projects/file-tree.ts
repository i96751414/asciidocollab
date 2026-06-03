import type { FastifyInstance } from 'fastify';
import { fileTreeGetRoutes } from './file-tree-get';
import { fileTreeCreateRoutes } from './file-tree-create';
import { fileTreeDeleteRoutes } from './file-tree-delete';
import { fileTreePatchRoutes } from './file-tree-patch';

/** Registers file tree CRUD routes under /projects/:projectId/files. */
export async function fileTreeRoutes(app: FastifyInstance): Promise<void> {
  await app.register(fileTreeGetRoutes);
  await app.register(fileTreeCreateRoutes);
  await app.register(fileTreeDeleteRoutes);
  await app.register(fileTreePatchRoutes);
}
