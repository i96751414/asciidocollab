import type convict from 'convict';
import { COLLAB_INTERNAL_PORT_DEFAULT } from '@asciidocollab/shared';

/** Collaboration server configuration. */
export interface CollabConfig {
  /** Loopback port apps/api binds its internal collab auth server to. */
  internalPort: number;
  /** Host interface apps/api binds its internal collab auth server to. */
  internalHost: string;
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
