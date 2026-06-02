import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { FileTreeEventDto } from '@asciidocollab/shared';

type Listener = (event: FileTreeEventDto) => void;

/** Event bus for broadcasting file tree changes to SSE subscribers keyed by project. */
export interface FileTreeEventBus {
  /**
   * Emits a file tree event to all subscribers for the given project.
   *
   * @param projectId - The project whose subscribers receive the event.
   * @param event - The file tree change event payload.
   */
  emit(projectId: string, event: FileTreeEventDto): void;
  /**
   * Registers a listener for file tree events on a project and returns an unsubscribe function.
   *
   * @param projectId - The project to subscribe to.
   * @param listener - Callback invoked for each incoming event.
   * @returns A function that removes the listener when called.
   */
  subscribe(projectId: string, listener: Listener): () => void;
}

declare module 'fastify' {
  interface FastifyInstance {
    fileTreeEventBus: FileTreeEventBus;
  }
}

export const fileTreeEventBusPlugin = fp(async function (app: FastifyInstance) {
  const targets = new Map<string, EventTarget>();
  const listenerCounts = new Map<string, number>();

  const bus: FileTreeEventBus = {
    emit(projectId: string, event: FileTreeEventDto) {
      targets.get(projectId)?.dispatchEvent(new CustomEvent('event', { detail: event }));
    },

    subscribe(projectId: string, listener: Listener): () => void {
      if (!targets.has(projectId)) {
        targets.set(projectId, new EventTarget());
        listenerCounts.set(projectId, 0);
      }

      const target = targets.get(projectId)!;
      const handler = (event: Event) => {
        if (event instanceof CustomEvent) {
          listener(event.detail);
        }
      };
      target.addEventListener('event', handler);
      listenerCounts.set(projectId, (listenerCounts.get(projectId) ?? 0) + 1);

      return () => {
        target.removeEventListener('event', handler);
        const count = (listenerCounts.get(projectId) ?? 1) - 1;
        listenerCounts.set(projectId, count);
        if (count === 0) {
          targets.delete(projectId);
          listenerCounts.delete(projectId);
        }
      };
    },
  };

  app.decorate('fileTreeEventBus', bus);
});
