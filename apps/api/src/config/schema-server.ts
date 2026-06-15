import type convict from 'convict';

/** API server, network, CORS, and HTTPS configuration. */
export interface ServerApiConfig {
  /** Port to bind the HTTP server. */
  port: number;
  /** Host to bind the HTTP server. */
  host: string;
  /** Trust X-Forwarded-For headers from reverse proxy. */
  trustProxy: boolean;
  /** Comma-separated list of allowed CORS origins. */
  corsOrigins: string;
  /** Base URL for frontend (used in password reset links). */
  frontendUrl: string;
  /** Enable HTTP to HTTPS redirect. */
  httpsRedirect: boolean;
}

/** Convict schema fragment for the API server, network, CORS, and HTTPS domain. */
export const apiSchema: convict.Schema<ServerApiConfig> = {
  port: {
    doc: 'Port to bind the HTTP server.',
    format: 'port',
    default: 4000,
    env: 'ASCIIDOCOLLAB_API_PORT',
  },
  host: {
    doc: 'Host to bind the HTTP server.',
    format: 'hostname',
    default: '0.0.0.0',
    env: 'ASCIIDOCOLLAB_API_HOST',
  },
  trustProxy: {
    doc: 'Trust X-Forwarded-For headers from reverse proxy.',
    format: Boolean,
    default: false,
    env: 'ASCIIDOCOLLAB_API_TRUST_PROXY',
  },
  corsOrigins: {
    doc: 'Comma-separated list of allowed CORS origins. Empty string disables CORS.',
    format: String,
    default: '',
    env: 'ASCIIDOCOLLAB_API_CORS_ORIGINS',
  },
  frontendUrl: {
    doc: 'Base URL for frontend (used in password reset links).',
    format: String,
    default: 'https://asciidocollab.example.com',
    env: 'ASCIIDOCOLLAB_API_FRONTEND_URL',
  },
  httpsRedirect: {
    doc: 'Enable HTTP to HTTPS redirect.',
    format: Boolean,
    default: false,
    env: 'ASCIIDOCOLLAB_API_HTTPS_REDIRECT',
  },
};
