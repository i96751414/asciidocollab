'use client';
import { useEffect, useRef } from 'react';
import type {
  ContentChangedEventDto,
  FileTreeEventDto,
  MainFileChangedEventDto,
  ProjectEventDto,
} from '@asciidocollab/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let workerInstance: SharedWorker | null = null;

function getWorker(): SharedWorker | null {
  if (typeof SharedWorker === 'undefined') return null;
  if (!workerInstance) {
    workerInstance = new SharedWorker('/workers/file-tree-events.worker.js', { type: 'classic', name: 'file-tree-events' });
    workerInstance.port.start();
  }
  return workerInstance;
}

/** Per-type callbacks for the project SSE stream; every field is optional so a consumer opts into only what it needs. */
export interface ProjectEventHandlers {
  /** A structural file-tree change (created/deleted/renamed/moved). */
  onFileTreeEvent?: (event: FileTreeEventDto) => void;
  /** A file's content changed live (a collaborator's edit) or was saved. */
  onContentChanged?: (event: ContentChangedEventDto) => void;
  /** The project's designated main file setting changed. */
  onMainFileChanged?: (event: MainFileChangedEventDto) => void;
  /** The SSE connection dropped and reconnected; the consumer should resync from scratch. */
  onReconnect?: () => void;
}

/**
 * Subscribes to the project's SSE event stream via a SharedWorker (one SSE connection shared across
 * all tabs) and dispatches each {@link ProjectEventDto} to the matching handler by its `type`.
 *
 * @param projectId - The project whose event stream to subscribe to.
 * @param handlers - Per-type callbacks; only the provided ones fire.
 */
export function useFileTreeEvents(projectId: string, handlers: ProjectEventHandlers): void {
  const handlersReference = useRef(handlers);
  handlersReference.current = handlers;

  useEffect(() => {
    const worker = getWorker();
    if (!worker) return;

    worker.port.postMessage({ type: 'subscribe', projectId, apiBase: API_BASE });

    const handleMessage = (message: MessageEvent) => {
      const data = message.data;
      if (data?.type === 'reconnect') {
        handlersReference.current.onReconnect?.();
        return;
      }
      if (data?.type !== 'project-event') return;
      const event = data.event as ProjectEventDto;
      const current = handlersReference.current;
      switch (event.type) {
        case 'content-changed':
          current.onContentChanged?.(event);
          break;
        case 'main-file-changed':
          current.onMainFileChanged?.(event);
          break;
        default:
          // Remaining union members are the structural file-tree events.
          current.onFileTreeEvent?.(event);
      }
    };

    worker.port.addEventListener('message', handleMessage);

    return () => {
      worker.port.removeEventListener('message', handleMessage);
      worker.port.postMessage({ type: 'unsubscribe', projectId });
    };
  }, [projectId]);
}
