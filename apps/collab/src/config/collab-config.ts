import convict from 'convict';
import { COLLAB_INTERNAL_PORT_DEFAULT } from '@asciidocollab/shared';

/** Builds a convict format that rejects anything other than a positive integer (>= 1). */
function positiveInteger(name: string) {
  return (value: number): void => {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive integer >= 1`);
    }
  };
}

/** Typed configuration interface for the collaboration server. */
export interface CollabConfig {
  /** WebSocket port for the collaboration server. */
  port: number;
  /** Port for the internal HTTP server the API calls to rewrite references in live documents. */
  internalEditPort: number;
  /** Interface the internal edit server binds to (loopback by default for safety). */
  internalEditHost: string;
  /** Optional shared secret enforced on the internal edit endpoint (defense-in-depth on loopback). */
  internalEditSecret: string;
  /** Server mTLS material for the internal edit endpoint. All fields empty disables mTLS (loopback HTTP). */
  internalEditTls: {
    /** Path to the PEM file containing the server certificate. */
    cert: string;
    /** Path to the PEM file containing the server private key. */
    key: string;
    /** Path to the PEM file containing the CA certificate used to verify the API client certificate. */
    clientCa: string;
  };
  /** Internal URL used by the auth hook to reach apps/api internal server. */
  apiInternalUrl: string;
  /** Auth hook HTTP request timeout in milliseconds. */
  authTimeoutMs: number;
  /** Orphaned-room watchdog polling interval in milliseconds. */
  watchdogIntervalMs: number;
  /** Comma-separated list of allowed WebSocket-handshake Origins; empty disables the check. */
  allowedOrigins: string;
  /** Maximum size in bytes of a single inbound collaboration message. */
  maxPayloadBytes: number;
  /** Maximum concurrent WebSocket connections per authenticated user. */
  maxConnectionsPerUser: number;
  /** Maximum distinct rooms a single user may join concurrently. */
  maxRoomsPerUser: number;
  /** Maximum new connections accepted per authenticated user per minute. */
  connectRatePerMin: number;
  /** Root directory for per-project file storage. */
  storagePath: string;
  /** PostgreSQL connection URL. */
  databaseUrl: string;
  /** MTLS client certificate paths for connecting to the apps/api internal server. Leave empty to use plain HTTP (loopback only). */
  apiInternalTls: {
    /** Path to the PEM file containing the client certificate presented to apps/api. */
    cert: string;
    /** Path to the PEM file containing the client private key. */
    key: string;
    /** Path to the PEM file containing the CA certificate used to validate the apps/api server certificate. */
    ca: string;
  };
}

/** Creates a new convict configuration instance for the collaboration server. */
export function createCollabConfig() {
  return convict<CollabConfig>({
    port: {
      doc: 'WebSocket port for the collaboration server.',
      format: 'port',
      default: 4002,
      env: 'ASCIIDOCOLLAB_COLLAB_PORT',
    },
    internalEditPort: {
      doc: 'Port for the internal HTTP server the API calls to rewrite references in live documents.',
      format: 'port',
      default: 4003,
      env: 'ASCIIDOCOLLAB_COLLAB_INTERNAL_EDIT_PORT',
    },
    internalEditHost: {
      doc: 'Interface the internal edit server binds to. Defaults to loopback; do not expose publicly.',
      format: String,
      default: '127.0.0.1',
      env: 'ASCIIDOCOLLAB_COLLAB_INTERNAL_EDIT_HOST',
    },
    internalEditSecret: {
      doc: 'Optional shared secret enforced on the internal edit endpoint. Empty disables the check (loopback-trust, development only — set this in production).',
      format: String,
      default: '',
      sensitive: true,
      env: 'ASCIIDOCOLLAB_COLLAB_INTERNAL_EDIT_SECRET',
    },
    internalEditTls: {
      cert: {
        doc: 'Path to PEM file containing the server certificate for the internal edit mTLS server. Empty disables mTLS (loopback HTTP only).',
        format: String,
        default: '',
        env: 'ASCIIDOCOLLAB_COLLAB_INTERNAL_EDIT_TLS_CERT',
      },
      key: {
        doc: 'Path to PEM file containing the server private key for the internal edit mTLS server.',
        format: String,
        default: '',
        env: 'ASCIIDOCOLLAB_COLLAB_INTERNAL_EDIT_TLS_KEY',
      },
      clientCa: {
        doc: 'Path to PEM file containing the CA certificate used to verify the API client certificate.',
        format: String,
        default: '',
        env: 'ASCIIDOCOLLAB_COLLAB_INTERNAL_EDIT_TLS_CLIENT_CA',
      },
    },
    apiInternalUrl: {
      doc: 'Internal URL used by the auth hook to reach apps/api internal server.',
      format: String,
      default: `http://127.0.0.1:${COLLAB_INTERNAL_PORT_DEFAULT}`,
      env: 'ASCIIDOCOLLAB_COLLAB_API_INTERNAL_URL',
    },
    authTimeoutMs: {
      doc: 'Auth hook HTTP request timeout in milliseconds.',
      format: positiveInteger('authTimeoutMs'),
      default: 3000,
      env: 'ASCIIDOCOLLAB_COLLAB_AUTH_TIMEOUT_MS',
    },
    watchdogIntervalMs: {
      doc: 'Orphaned-room watchdog polling interval in milliseconds.',
      format: positiveInteger('watchdogIntervalMs'),
      default: 30_000,
      env: 'ASCIIDOCOLLAB_COLLAB_WATCHDOG_INTERVAL_MS',
    },
    allowedOrigins: {
      doc: 'Comma-separated list of allowed WebSocket-handshake Origins. Empty disables the Origin check (development only — set this in production).',
      format: String,
      default: '',
      env: 'ASCIIDOCOLLAB_COLLAB_ALLOWED_ORIGINS',
    },
    maxPayloadBytes: {
      doc: 'Maximum size in bytes of a single inbound collaboration message.',
      format: positiveInteger('maxPayloadBytes'),
      default: 1_048_576,
      env: 'ASCIIDOCOLLAB_COLLAB_MAX_PAYLOAD_BYTES',
    },
    maxConnectionsPerUser: {
      doc: 'Maximum concurrent WebSocket connections per authenticated user.',
      format: positiveInteger('maxConnectionsPerUser'),
      default: 20,
      env: 'ASCIIDOCOLLAB_COLLAB_MAX_CONNECTIONS_PER_USER',
    },
    maxRoomsPerUser: {
      doc: 'Maximum distinct rooms a single user may join concurrently.',
      format: positiveInteger('maxRoomsPerUser'),
      default: 50,
      env: 'ASCIIDOCOLLAB_COLLAB_MAX_ROOMS_PER_USER',
    },
    connectRatePerMin: {
      doc: 'Maximum new connections accepted per authenticated user per minute.',
      format: positiveInteger('connectRatePerMin'),
      default: 120,
      env: 'ASCIIDOCOLLAB_COLLAB_CONNECT_RATE_PER_MIN',
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
    apiInternalTls: {
      cert: {
        doc: 'Path to PEM file containing the client certificate presented to apps/api. Empty string disables mTLS (loopback HTTP only).',
        format: String,
        default: '',
        env: 'ASCIIDOCOLLAB_COLLAB_API_INTERNAL_TLS_CERT',
      },
      key: {
        doc: 'Path to PEM file containing the client private key for mTLS.',
        format: String,
        default: '',
        env: 'ASCIIDOCOLLAB_COLLAB_API_INTERNAL_TLS_KEY',
      },
      ca: {
        doc: 'Path to PEM file containing the CA certificate used to validate the apps/api server certificate.',
        format: String,
        default: '',
        env: 'ASCIIDOCOLLAB_COLLAB_API_INTERNAL_TLS_CA',
      },
    },
  });
}
