import type convict from 'convict';
import { COLLAB_INTERNAL_PORT_DEFAULT } from '@asciidocollab/shared';

/** Collaboration server configuration. */
export interface CollabConfig {
  /** Loopback port apps/api binds its internal collab auth server to. */
  internalPort: number;
  /** Host interface apps/api binds its internal collab auth server to. */
  internalHost: string;
  /** Base URL of the collab server's internal edit endpoint (used to rewrite references in live docs). */
  editUrl: string;
  /** Optional shared secret sent to the collab edit endpoint (must match the collab server's). */
  editSecret: string;
  /** Client mTLS material for the collab edit endpoint. All fields empty disables mTLS (loopback HTTP). */
  editTls: {
    /** Path to the PEM file containing the client certificate presented to the collab edit server. */
    cert: string;
    /** Path to the PEM file containing the client private key. */
    key: string;
    /** Path to the PEM file containing the CA certificate used to verify the collab edit server. */
    ca: string;
  };
  /** MTLS certificate paths for the internal collab auth server. All fields empty disables mTLS. */
  internalTls: {
    /** Path to the PEM file containing the server certificate. */
    cert: string;
    /** Path to the PEM file containing the server private key. */
    key: string;
    /** Path to the PEM file containing the CA certificate used to verify collab client certificates. */
    clientCa: string;
  };
}

/** Convict schema fragment for the collaboration server domain. */
export const collabSchema: convict.Schema<CollabConfig> = {
  internalPort: {
    doc: 'Loopback port apps/api binds its internal collab auth server to.',
    format: 'port',
    default: COLLAB_INTERNAL_PORT_DEFAULT,
    env: 'ASCIIDOCOLLAB_COLLAB_INTERNAL_PORT',
  },
  internalHost: {
    doc: 'Host interface apps/api binds its internal collab auth server to. Defaults to loopback; set to 0.0.0.0 or a specific IP when collab runs on a separate machine.',
    format: String,
    default: '127.0.0.1',
    env: 'ASCIIDOCOLLAB_COLLAB_INTERNAL_HOST',
  },
  editUrl: {
    doc: "Base URL of the collab server's internal edit endpoint. Used to apply cross-file reference rewrites to live collaborative documents via the Yjs source of truth.",
    format: String,
    default: 'http://127.0.0.1:4003',
    env: 'ASCIIDOCOLLAB_COLLAB_EDIT_URL',
  },
  editSecret: {
    doc: "Optional shared secret sent to the collab edit endpoint; must match the collab server's ASCIIDOCOLLAB_COLLAB_INTERNAL_EDIT_SECRET. Empty relies on loopback isolation.",
    format: String,
    default: '',
    sensitive: true,
    env: 'ASCIIDOCOLLAB_COLLAB_EDIT_SECRET',
  },
  editTls: {
    cert: {
      doc: 'Path to PEM file containing the client certificate presented to the collab edit server (mTLS). Empty disables mTLS.',
      format: String,
      default: '',
      env: 'ASCIIDOCOLLAB_COLLAB_EDIT_TLS_CERT',
    },
    key: {
      doc: 'Path to PEM file containing the client private key for the collab edit mTLS connection.',
      format: String,
      default: '',
      env: 'ASCIIDOCOLLAB_COLLAB_EDIT_TLS_KEY',
    },
    ca: {
      doc: 'Path to PEM file containing the CA certificate used to verify the collab edit server certificate.',
      format: String,
      default: '',
      env: 'ASCIIDOCOLLAB_COLLAB_EDIT_TLS_CA',
    },
  },
  internalTls: {
    cert: {
      doc: 'Path to PEM file containing the server certificate for the internal mTLS server. Empty string disables mTLS.',
      format: String,
      default: '',
      env: 'ASCIIDOCOLLAB_COLLAB_INTERNAL_TLS_CERT',
    },
    key: {
      doc: 'Path to PEM file containing the server private key for the internal mTLS server.',
      format: String,
      default: '',
      env: 'ASCIIDOCOLLAB_COLLAB_INTERNAL_TLS_KEY',
    },
    clientCa: {
      doc: 'Path to PEM file containing the CA certificate used to verify client certificates (collab server).',
      format: String,
      default: '',
      env: 'ASCIIDOCOLLAB_COLLAB_INTERNAL_TLS_CLIENT_CA',
    },
  },
};
