import convict from 'convict';
import { COLLAB_INTERNAL_PORT_DEFAULT } from '@asciidocollab/shared';

/** Configuration schema for the collaboration server. */
export interface CollabConfigSchema {
  /** WebSocket port for the collaboration server. */
  port: number;
  /** Internal URL used by the auth hook to reach apps/api internal server. */
  apiInternalUrl: string;
  /** Auth hook HTTP request timeout in milliseconds. */
  authTimeoutMs: number;
  /** Orphaned-room watchdog polling interval in milliseconds. */
  watchdogIntervalMs: number;
  /** Root directory for per-project file storage. */
  storagePath: string;
  /** PostgreSQL connection URL. */
  databaseUrl: string;
}

/** Creates a new convict configuration instance for the collaboration server. */
export function createCollabConfig() {
  return convict<CollabConfigSchema>({
    port: {
      doc: 'WebSocket port for the collaboration server.',
      format: 'port',
      default: 4002,
      env: 'ASCIIDOCOLLAB_COLLAB_PORT',
    },
    apiInternalUrl: {
      doc: 'Internal URL used by the auth hook to reach apps/api internal server.',
      format: String,
      default: `http://127.0.0.1:${COLLAB_INTERNAL_PORT_DEFAULT}`,
      env: 'ASCIIDOCOLLAB_COLLAB_API_INTERNAL_URL',
    },
    authTimeoutMs: {
      doc: 'Auth hook HTTP request timeout in milliseconds.',
      format: (value: number): void => {
        if (!Number.isInteger(value) || value < 1) {
          throw new Error('authTimeoutMs must be a positive integer >= 1');
        }
      },
      default: 3000,
      env: 'ASCIIDOCOLLAB_COLLAB_AUTH_TIMEOUT_MS',
    },
    watchdogIntervalMs: {
      doc: 'Orphaned-room watchdog polling interval in milliseconds.',
      format: (value: number): void => {
        if (!Number.isInteger(value) || value < 1) {
          throw new Error('watchdogIntervalMs must be a positive integer >= 1');
        }
      },
      default: 30_000,
      env: 'ASCIIDOCOLLAB_COLLAB_WATCHDOG_INTERVAL_MS',
    },
    storagePath: {
      doc: 'Root directory for per-project file storage (shared with apps/api).',
      format: String,
      default: './storage',
      env: 'ASCIIDOCOLLAB_STORAGE_PATH',
    },
    databaseUrl: {
      doc: 'PostgreSQL connection URL.',
      format: String,
      default: '',
      sensitive: true,
      env: 'ASCIIDOCOLLAB_DATABASE_URL',
    },
  });
}

/** Typed convict config instance for the collaboration server. */
export type CollabConfig = ReturnType<typeof createCollabConfig>;
