import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from 'pino';

type FetchFunction = typeof globalThis.fetch;

/** Options for {@link verifySharedStorage}. */
export interface StorageProbeOptions {
  /** The collaboration server's resolved file-storage root. */
  storagePath: string;
  /** Base URL of the apps/api internal server (same one the auth hook uses). */
  apiInternalUrl: string;
  /** Maximum milliseconds to wait for a single probe HTTP request. */
  timeoutMs: number;
  /**
   * Total milliseconds to keep retrying while the API is unreachable (connection refused) —
   * the collab and API processes may start concurrently, so the API's internal port can lag.
   * Connection failures retry until this budget is exhausted; a reachable API that reports
   * divergent storage fails immediately (no retry). Defaults to 15s.
   */
  readyTimeoutMs?: number;
  /** Injectable fetch (defaults to globalThis.fetch); pass the mTLS fetch when configured. */
  fetch?: FetchFunction;
  /** Logger for the success line. */
  logger: Logger;
}

const PROBE_PREFIX = '.collab-storage-probe-';
const READY_TIMEOUT_DEFAULT_MS = 15_000;
const RETRY_INTERVAL_MS = 500;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fails fast unless the collaboration server and the REST API share one physical
 * file-storage root.
 *
 * Collaboration persistence REQUIRES shared storage: the collab server writes
 * document edits back to storage and the API serves them via GET /content and
 * downloads. If the two processes use different roots, edits silently never reach
 * the REST source of truth and the sides overwrite each other — a data-loss bug
 * (it is why scripts/dev.sh, which ran the two servers from different working
 * directories with the cwd-relative default `./storage`, corrupted documents).
 *
 * Detection is PHYSICAL, not string equality: this drops a uniquely-named sentinel
 * into the collab storage root and asks the API whether the same file is visible
 * under its own root. That correctly treats a shared network mount as shared even
 * when the two processes resolve it to different path strings.
 *
 * @throws {Error} If storage is not shared or the probe endpoint cannot be reached. The
 * caller is expected to abort startup rather than run with divergent storage.
 */
export async function verifySharedStorage(options: StorageProbeOptions): Promise<void> {
  const { storagePath, apiInternalUrl, timeoutMs, logger } = options;
  const readyTimeoutMs = options.readyTimeoutMs ?? READY_TIMEOUT_DEFAULT_MS;
  const fetchFunction = options.fetch ?? globalThis.fetch;
  const token = randomUUID();
  const sentinel = path.resolve(storagePath, `${PROBE_PREFIX}${token}`);

  // The storage root may not exist yet on a first run; create it so the sentinel write succeeds.
  await mkdir(storagePath, { recursive: true });
  await writeFile(sentinel, 'asciidocollab-storage-consistency-probe');
  try {
    const url = `${apiInternalUrl}/internal/collab/storage-probe?token=${encodeURIComponent(token)}`;
    // The API may still be starting (its internal port can come up after ours), so retry
    // connection failures for a bounded window rather than dying on a startup race.
    const deadline = Date.now() + readyTimeoutMs;
    let response: Awaited<ReturnType<FetchFunction>>;
    for (;;) {
      try {
        response = await fetchFunction(url, { signal: AbortSignal.timeout(timeoutMs) });
        break;
      } catch (error) {
        if (Date.now() >= deadline) {
          throw new Error(
            `Could not reach the API storage-probe endpoint at ${apiInternalUrl} to verify shared storage ` +
              `after ${readyTimeoutMs}ms (${error instanceof Error ? error.message : String(error)}). Is apps/api running?`,
            { cause: error },
          );
        }
        await delay(RETRY_INTERVAL_MS);
      }
    }
    if (response.status !== 200) {
      throw new Error(`The API storage-probe endpoint returned HTTP ${response.status}.`);
    }
    const body: unknown = await response.json().catch(() => null);
    const shared =
      typeof body === 'object' && body !== null && 'shared' in body && body.shared === true;
    if (!shared) {
      throw new Error(
        'The collaboration server and the REST API do NOT share the same file-storage root, so ' +
          'collaborative edits would never reach the documents the API serves and the two sides would ' +
          'overwrite each other.\n' +
          `  collab storage root: ${path.resolve(storagePath)}\n` +
          'Set ASCIIDOCOLLAB_STORAGE_PATH to the SAME absolute directory (a shared mount) for both ' +
          'apps/api and apps/collab, then restart.',
      );
    }
    logger.info({ storagePath: path.resolve(storagePath) }, 'Verified shared file storage with the API');
  } finally {
    // Best-effort cleanup; a stray sentinel is harmless (hidden, tiny, overwritten next run).
    await rm(sentinel, { force: true }).catch(() => undefined);
  }
}
