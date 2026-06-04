'use client';
import { useEffect, useRef } from 'react';
import type { FileTreeEventDto } from '@asciidocollab/shared';

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

/** Subscribes to file tree SSE events for a project via a SharedWorker (one SSE connection shared across all tabs). */
export function useFileTreeEvents(
  projectId: string,
  onEvent: (event: FileTreeEventDto) => void,
  onReconnect: () => void,
): void {
  const onEventReference = useRef(onEvent);
  const onReconnectReference = useRef(onReconnect);
  onEventReference.current = onEvent;
  onReconnectReference.current = onReconnect;

  useEffect(() => {
    const worker = getWorker();
    if (!worker) return;

    worker.port.postMessage({ type: 'subscribe', projectId, apiBase: API_BASE });

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'file-tree-change') {
        const dto: FileTreeEventDto = event.data.event;
        onEventReference.current(dto);
      } else if (event.data?.type === 'reconnect') {
        onReconnectReference.current();
      }
    };

    worker.port.addEventListener('message', handleMessage);

    return () => {
      worker.port.removeEventListener('message', handleMessage);
      worker.port.postMessage({ type: 'unsubscribe', projectId });
    };
  }, [projectId]);
}
