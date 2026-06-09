import { createCollabConfig } from '../src/config/collab-config';

describe('createCollabConfig', () => {
  const VALID_ENV = {
    ASCIIDOCOLLAB_COLLAB_AUTH_TIMEOUT_MS: '3000',
    ASCIIDOCOLLAB_COLLAB_WATCHDOG_INTERVAL_MS: '30000',
    ASCIIDOCOLLAB_DATABASE_URL: 'postgresql://localhost/test',
  };

  function withEnvironment(overrides: Record<string, string>, function_: () => void) {
    const backup: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries({ ...VALID_ENV, ...overrides })) {
      backup[key] = process.env[key];
      process.env[key] = value;
    }
    try {
      function_();
    } finally {
      for (const [key, value] of Object.entries(backup)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  }

  it('creates config with default authTimeoutMs of 3000', () => {
    const config = createCollabConfig();
    expect(config.get('authTimeoutMs')).toBe(3000);
  });

  it('throws when authTimeoutMs is 0 — prevents AbortSignal.timeout(0) silently blocking all connections', () => {
    withEnvironment({ ASCIIDOCOLLAB_COLLAB_AUTH_TIMEOUT_MS: '0' }, () => {
      expect(() => {
        const config = createCollabConfig();
        config.validate();
      }).toThrow();
    });
  });

  it('throws when authTimeoutMs is negative', () => {
    withEnvironment({ ASCIIDOCOLLAB_COLLAB_AUTH_TIMEOUT_MS: '-1' }, () => {
      expect(() => {
        const config = createCollabConfig();
        config.validate();
      }).toThrow();
    });
  });

  it('throws when watchdogIntervalMs is 0', () => {
    withEnvironment({ ASCIIDOCOLLAB_COLLAB_WATCHDOG_INTERVAL_MS: '0' }, () => {
      expect(() => {
        const config = createCollabConfig();
        config.validate();
      }).toThrow();
    });
  });

  it('accepts valid positive integers for authTimeoutMs and watchdogIntervalMs', () => {
    withEnvironment({ ASCIIDOCOLLAB_COLLAB_AUTH_TIMEOUT_MS: '5000', ASCIIDOCOLLAB_COLLAB_WATCHDOG_INTERVAL_MS: '60000' }, () => {
      expect(() => {
        const config = createCollabConfig();
        config.validate();
      }).not.toThrow();
    });
  });

  it('apiInternalTls.cert defaults to empty string (mTLS disabled in development)', () => {
    const config = createCollabConfig();
    expect(config.get('apiInternalTls.cert')).toBe('');
  });

  it('apiInternalTls.key defaults to empty string', () => {
    const config = createCollabConfig();
    expect(config.get('apiInternalTls.key')).toBe('');
  });

  it('apiInternalTls.ca defaults to empty string', () => {
    const config = createCollabConfig();
    expect(config.get('apiInternalTls.ca')).toBe('');
  });

  it('reads apiInternalTls.cert from ASCIIDOCOLLAB_COLLAB_API_INTERNAL_TLS_CERT', () => {
    withEnvironment({ ASCIIDOCOLLAB_COLLAB_API_INTERNAL_TLS_CERT: '/certs/client.pem' }, () => {
      const config = createCollabConfig();
      expect(config.get('apiInternalTls.cert')).toBe('/certs/client.pem');
    });
  });
});
