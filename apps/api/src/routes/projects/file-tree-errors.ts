import type { FastifyReply } from 'fastify';
import {
  PermissionDeniedError,
  FileConflictError,
  FileNodeNotFoundError,
  CannotDeleteRootFolderError,
} from '@asciidocollab/domain';

/** Maps a string value to the `'file'` or `'folder'` node type union. */
export function toNodeType(value: string): 'file' | 'folder' {
  return value === 'folder' ? 'folder' : 'file';
}

/**
 * Translates a domain error into the appropriate HTTP error response.
 *
 * The `authz.denied` audit event for a {@link PermissionDeniedError} is now
 * recorded inside the file-tree use cases (in the domain), so this boundary
 * helper only maps the error to its HTTP status.
 */
export function sendFileTreeError(reply: FastifyReply, error: Error) {
  if (error instanceof PermissionDeniedError) {
    return reply.status(403).send({ error: { code: 'FORBIDDEN', message: error.message } });
  }
  if (error instanceof FileConflictError) {
    const body: Record<string, unknown> = { error: { code: 'CONFLICT', message: error.message } };
    if (error.existingId) body['existingFileNodeId'] = error.existingId;
    return reply.status(409).send(body);
  }
  if (error instanceof FileNodeNotFoundError) {
    return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'File not found' } });
  }
  if (error instanceof CannotDeleteRootFolderError) {
    return reply.status(400).send({ error: { code: 'CANNOT_DELETE_ROOT', message: error.message } });
  }
  return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}
