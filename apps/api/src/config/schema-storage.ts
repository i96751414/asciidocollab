import type convict from 'convict';

/** Per-project file storage configuration. */
export interface StorageConfig {
  /** Root directory for per-project file storage. */
  path: string;
  /** Maximum permitted upload size in bytes. */
  maxUploadSizeBytes: number;
}

/** Download rate limiting configuration. */
export interface DownloadsConfig {
  /** ZIP download rate limiting configuration. */
  zip: {
    /** Maximum ZIP download requests per IP per window. */
    rateLimitMax: number;
    /** ZIP download rate limit window in milliseconds. */
    rateLimitWindow: number;
  };
  /** Individual file download rate limiting configuration. */
  file: {
    /** Maximum individual file download requests per IP per window. */
    rateLimitMax: number;
    /** Individual file download rate limit window in milliseconds. */
    rateLimitWindow: number;
  };
}

/** Convict schema fragment for the file storage domain. */
export const storageSchema: convict.Schema<StorageConfig> = {
  path: {
    doc: 'Root directory for per-project file storage.',
    format: String,
    default: './storage',
    env: 'ASCIIDOCOLLAB_STORAGE_PATH',
  },
  maxUploadSizeBytes: {
    doc: 'Maximum permitted upload size in bytes.',
    format: 'integer',
    default: 20_971_520,
    env: 'ASCIIDOCOLLAB_STORAGE_MAX_UPLOAD_BYTES',
  },
};

/** Convict schema fragment for the file/ZIP download domain. */
export const downloadsSchema: convict.Schema<DownloadsConfig> = {
  zip: {
    rateLimitMax: {
      doc: 'Maximum ZIP download requests per IP per window.',
      format: 'integer',
      default: 10,
      env: 'ASCIIDOCOLLAB_DOWNLOADS_ZIP_RATE_LIMIT_MAX',
    },
    rateLimitWindow: {
      doc: 'ZIP download rate limit window in milliseconds.',
      format: 'integer',
      default: 60_000,
      env: 'ASCIIDOCOLLAB_DOWNLOADS_ZIP_RATE_LIMIT_WINDOW',
    },
  },
  file: {
    rateLimitMax: {
      doc: 'Maximum individual file download requests per IP per window.',
      format: 'integer',
      default: 30,
      env: 'ASCIIDOCOLLAB_DOWNLOADS_FILE_RATE_LIMIT_MAX',
    },
    rateLimitWindow: {
      doc: 'Individual file download rate limit window in milliseconds.',
      format: 'integer',
      default: 60_000,
      env: 'ASCIIDOCOLLAB_DOWNLOADS_FILE_RATE_LIMIT_WINDOW',
    },
  },
};
