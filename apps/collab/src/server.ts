import { Server } from '@hocuspocus/server';
import type { Extension, onConnectPayload, onDisconnectPayload } from '@hocuspocus/server';
import type { SystemSettingRepository, DocumentRepository } from '@asciidocollab/domain';
import { YjsStateId, ProjectId, DocumentId } from '@asciidocollab/domain';
import type { Result } from '@asciidocollab/domain';
import pino from 'pino';

const logger = pino({ redact: ['req.headers.cookie', 'req.headers.Cookie'] });

const COLLAB_WRITEBACK_INTERVAL_KEY = 'collaboration.writeback_interval_seconds';
const COLLAB_WRITEBACK_INTERVAL_DEFAULT = 30;

/** Callbacks invoked when the first client joins or the last client leaves a room. */
export interface SessionCallbacks {
  /**
   * Called when the first client connects to a room.
   *
   * @param projectId - The project that owns the document.
   * @param documentId - The document being opened for collaboration.
   * @returns Result indicating success or failure.
   */
  onRoomOpen(projectId: ProjectId, documentId: DocumentId): Promise<Result<void, Error>>;
  /**
   * Called when the last client disconnects from a room.
   *
   * @param projectId - The project that owns the document.
   * @param documentId - The document being closed.
   * @returns Result indicating success or failure.
   */
  onRoomClose(projectId: ProjectId, documentId: DocumentId): Promise<Result<void, Error>>;
}

/** Parses a Hocuspocus room name of the form `<projectId>/<yjsStateId>` into typed value objects. */
export function parseRoomName(documentName: string) {
  const slash = documentName.indexOf('/');
  return {
    projectId: ProjectId.create(documentName.slice(0, slash)),
    yjsStateId: YjsStateId.create(documentName.slice(slash + 1)),
  };
}

/** Creates and returns a configured Hocuspocus server instance. */
export async function createCollabServer(
  config: { port: number },
  extensions: Extension[],
  systemSettingRepo: SystemSettingRepository,
  sessionCallbacks?: SessionCallbacks,
  documentRepository?: DocumentRepository,
): Promise<ReturnType<typeof Server.configure>> {
  const intervalString = await systemSettingRepo.get(COLLAB_WRITEBACK_INTERVAL_KEY);
  const intervalSeconds = intervalString
    ? Number.parseInt(intervalString, 10)
    : COLLAB_WRITEBACK_INTERVAL_DEFAULT;
  const maxDebounce = intervalSeconds * 1000;

  const onConnect = sessionCallbacks && documentRepository
    ? async (payload: onConnectPayload) => {
        // onRoomOpen uses an upsert so calling it on every connect is safe and avoids
        // the race where two simultaneous first-connections both read connections.size===0
        // before either is registered. Edge case: if Hocuspocus fails to set up the
        // connection after this hook returns successfully, onDisconnect will never fire
        // and the session record will remain open until the next server restart (closeAll).
        try {
          const { projectId, yjsStateId } = parseRoomName(payload.documentName);
          const document = await documentRepository.findByYjsStateId(yjsStateId);
          if (!document) {
            logger.warn({ documentName: payload.documentName }, 'Document not found for room');
            throw new Error('Document not found');
          }
          const result = await sessionCallbacks.onRoomOpen(projectId, document.id);
          if (!result.success) {
            logger.error({ err: result.error, documentName: payload.documentName }, 'Failed to open collaboration session');
            throw result.error;
          }
          // Store documentId in context so onDisconnect can reuse it without a second DB lookup.
          payload.context.documentId = document.id;
        } catch (error) {
          logger.error({ err: error, documentName: payload.documentName }, 'Error in onConnect');
          throw error;
        }
      }
    : undefined;

  const onDisconnect = sessionCallbacks && documentRepository
    ? async (payload: onDisconnectPayload) => {
        if (payload.clientsCount !== 0) return;

        try {
          const { projectId } = parseRoomName(payload.documentName);
          // Reuse the documentId stored by onConnect to avoid a second DB lookup.
          const documentId: DocumentId | undefined = payload.context?.documentId;
          if (!documentId) return;
          // Re-check connection count after the async yield above — a new client may have
          // joined and called onRoomOpen while we were awaiting. If so, do not close the session.
          if (payload.document.getConnectionsCount() > 0) return;
          const result = await sessionCallbacks.onRoomClose(projectId, documentId);
          if (!result.success) {
            logger.error({ err: result.error, documentName: payload.documentName }, 'Failed to close collaboration session');
          }
        } catch (error) {
          logger.error({ err: error, documentName: payload.documentName }, 'Error in onDisconnect');
        }
      }
    : undefined;

  const server = Server.configure({
    port: config.port,
    debounce: 2000,
    maxDebounce,
    extensions,
    ...(onConnect && { onConnect }),
    ...(onDisconnect && { onDisconnect }),
  });

  return server;
}
