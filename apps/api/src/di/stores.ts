import {
  FilesystemProjectFileStore,
  FilesystemYjsStateStore,
} from '@asciidocollab/infrastructure';
import type { getConfig } from '../config';
import type { FastifyInstance } from 'fastify';

/**
 * Instantiates the filesystem-backed storage adapters for project files and
 * Yjs collaborative state.
 *
 * @param appConfig - The application configuration providing the storage path.
 * @returns The stores container decorated onto the Fastify instance.
 */
export function createStores(
  appConfig: ReturnType<typeof getConfig>,
): FastifyInstance['stores'] {
  const storagePath = appConfig.storage.path;
  return {
    fileStore: new FilesystemProjectFileStore(storagePath),
    yjsStateStore: new FilesystemYjsStateStore(storagePath),
  };
}
