import type { DocumentRepository } from '@asciidocollab/domain';
import pino from 'pino';
import { parseRoomName } from './server.js';

const logger = pino({ redact: ['req.headers.cookie', 'req.headers.Cookie'] });

interface HocuspocusServer {
  documents: Map<string, { destroy(): void }>;
}

/** Periodically checks for rooms whose documents no longer exist in the DB and destroys them. */
export function startOrphanedRoomWatchdog(
  server: HocuspocusServer,
  documentRepository: DocumentRepository,
  intervalMs: number,
): ReturnType<typeof setInterval> {
  return setInterval(async () => {
    for (const [roomName, document] of server.documents) {
      let yjsStateIdParsed;
      try {
        const { yjsStateId } = parseRoomName(roomName);
        yjsStateIdParsed = yjsStateId;
      } catch {
        // Room name is not in the expected <projectId>/<yjsStateId> format — skip.
        continue;
      }
      try {
        const document_ = await documentRepository.findByYjsStateId(yjsStateIdParsed);
        if (!document_) {
          document.destroy();
        }
      } catch (error) {
        logger.error({ err: error, roomName }, 'Watchdog: error checking document existence');
      }
    }
  }, intervalMs);
}
