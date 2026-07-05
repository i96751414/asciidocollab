import type { Extension, onChangePayload, beforeHandleMessagePayload } from '@hocuspocus/server';
import type { Logger } from 'pino';
import { isPresenceRoom } from '@asciidocollab/shared';

/** Options for {@link ChangeNotifierExtension}. */
export interface ChangeNotifierOptions {
  /** Base URL of the API internal server (e.g. `http://127.0.0.1:4001`). */
  apiInternalUrl: string;
  /** Path of the internal content-changed notify endpoint on that server. */
  notifyPath: string;
  /** Per-room debounce window (ms): a burst of live edits yields at most one notify per window. */
  debounceMs: number;
  /** Pino logger for best-effort failure diagnostics. */
  logger: Logger;
  /** Fetch implementation (defaults to global fetch); the composition root injects an mTLS fetch. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Hocuspocus extension that tells the API a document's content changed so it can broadcast a
 * `content-changed` event to the project's SSE subscribers (research D2). The collab server is the
 * only place that sees a collaborator's UNSAVED live edits.
 *
 * It is a **dumb relay**: it parses the room name into `{ projectId, yjsStateId }`, debounces per
 * room, and POSTs those bare ids off the Yjs hot path. It does no AsciiDoc parsing — relevance is
 * decided client-side (research D4). Delivery is best-effort: a non-2xx or unreachable API is logged
 * and dropped; the next edit, a save, or an SSE reconnect recovers consistency.
 */
export class ChangeNotifierExtension implements Extension {
  private readonly url: string;
  private readonly debounceMs: number;
  private readonly logger: Logger;
  private readonly fetchFunction: typeof globalThis.fetch;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Creates the extension resolving the notify URL from the base URL + path. */
  constructor(options: ChangeNotifierOptions) {
    this.url = new URL(options.notifyPath, options.apiInternalUrl).href;
    this.debounceMs = options.debounceMs;
    this.logger = options.logger;
    this.fetchFunction = options.fetch ?? globalThis.fetch;
  }

  /** Fires after a document update is applied — the primary change signal. */
  async onChange(payload: onChangePayload): Promise<void> {
    this.scheduleNotify(payload.documentName);
  }

  /** Fires on every inbound update — a fallback signal that shares the per-room debounce. */
  async beforeHandleMessage(payload: beforeHandleMessagePayload): Promise<void> {
    this.scheduleNotify(payload.documentName);
  }

  /** Clears any pending timers so a shutting-down server has no dangling notifications. */
  async onDestroy(): Promise<void> {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  /** Starts/refreshes the per-room debounce timer for a content room; presence rooms are skipped. */
  private scheduleNotify(documentName: string): void {
    if (isPresenceRoom(documentName)) return;
    const room = parseRoom(documentName);
    if (!room) return;

    const existing = this.timers.get(documentName);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.timers.delete(documentName);
      void this.notify(room.projectId, room.yjsStateId);
    }, this.debounceMs);
    timer.unref?.();
    this.timers.set(documentName, timer);
  }

  /** POSTs the bare ids to the API internal notify endpoint, tolerating any failure. */
  private async notify(projectId: string, yjsStateId: string): Promise<void> {
    try {
      const response = await this.fetchFunction(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, yjsStateId }),
      });
      if (!response.ok) {
        this.logger.warn({ status: response.status, projectId }, 'content-changed notify returned non-2xx (best-effort)');
      }
    } catch (error) {
      this.logger.warn({ err: error, projectId }, 'content-changed notify failed (best-effort)');
    }
  }
}

/** Parses a content room name (`<projectId>/<yjsStateId>`) into its two id strings, or null. */
function parseRoom(documentName: string): { projectId: string; yjsStateId: string } | null {
  const slash = documentName.indexOf('/');
  if (slash === -1) return null;
  const projectId = documentName.slice(0, slash);
  const yjsStateId = documentName.slice(slash + 1);
  if (!projectId || !yjsStateId) return null;
  return { projectId, yjsStateId };
}
