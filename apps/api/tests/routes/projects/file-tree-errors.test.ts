import type { FastifyReply } from 'fastify';
import {
  PermissionDeniedError,
  FileConflictError,
  FileNodeNotFoundError,
  CannotDeleteRootFolderError,
} from '@asciidocollab/domain';
import { sendFileTreeError, toNodeType } from '../../../src/routes/projects/file-tree-errors';

function mockReply() {
  const reply = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return reply as unknown as FastifyReply;
}

describe('toNodeType', () => {
  it('returns "folder" for "folder"', () => {
    expect(toNodeType('folder')).toBe('folder');
  });

  it('returns "file" for anything else', () => {
    expect(toNodeType('file')).toBe('file');
    expect(toNodeType('unknown')).toBe('file');
  });
});

describe('sendFileTreeError', () => {
  it('returns 403 FORBIDDEN for PermissionDeniedError', () => {
    const reply = mockReply();
    sendFileTreeError(reply, new PermissionDeniedError());
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('returns 409 CONFLICT for FileConflictError without existingId', () => {
    const reply = mockReply();
    sendFileTreeError(reply, new FileConflictError('conflict'));
    expect(reply.status).toHaveBeenCalledWith(409);
    const sent = (reply.send as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(sent['existingFileNodeId']).toBeUndefined();
  });

  it('includes existingFileNodeId when FileConflictError has existingId', () => {
    const reply = mockReply();
    const error = new FileConflictError('conflict', 'existing-node-id');
    sendFileTreeError(reply, error);
    expect(reply.status).toHaveBeenCalledWith(409);
    const sent = (reply.send as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(sent['existingFileNodeId']).toBe('existing-node-id');
  });

  it('returns 404 NOT_FOUND for FileNodeNotFoundError', () => {
    const reply = mockReply();
    sendFileTreeError(reply, new FileNodeNotFoundError('node-id'));
    expect(reply.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 CANNOT_DELETE_ROOT for CannotDeleteRootFolderError', () => {
    const reply = mockReply();
    sendFileTreeError(reply, new CannotDeleteRootFolderError('root-folder-id'));
    expect(reply.status).toHaveBeenCalledWith(400);
    const sent = (reply.send as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect((sent['error'] as Record<string, string>)['code']).toBe('CANNOT_DELETE_ROOT');
  });

  it('returns 500 INTERNAL_ERROR for unknown errors', () => {
    const reply = mockReply();
    sendFileTreeError(reply, new Error('unexpected'));
    expect(reply.status).toHaveBeenCalledWith(500);
    const sent = (reply.send as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect((sent['error'] as Record<string, string>)['code']).toBe('INTERNAL_ERROR');
  });
});
