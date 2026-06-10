import convict from 'convict';

/**
 * Custom convict format for hostname validation.
 */
convict.addFormat({
  name: 'hostname',
  validate: (value: unknown) => {
    if (typeof value !== 'string') {
      throw new TypeError('must be a string');
    }
    if (value.length === 0) {
      return; // empty string is valid (means bind to all interfaces)
    }
    const hostnameRegex = /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9])$/;
    if (!hostnameRegex.test(value) && value !== '0.0.0.0' && value !== 'localhost') {
      throw new Error(`must be a valid hostname, got "${value}"`);
    }
  },
});

/**
 * Custom convict format for a strictly-positive integer (>= 1).
 *
 * Unlike the built-in `int`/`integer` formats, this rejects 0 and negatives —
 * used for retention/window/interval settings where a non-positive value would
 * silently disable the behaviour (e.g. A zero coalescing window blacks out all
 * auth-attempt telemetry). `coerce` parses the string env vars convict supplies.
 */
convict.addFormat({
  name: 'positive-int',
  coerce: (value: unknown) => (typeof value === 'string' ? Number(value) : value),
  validate: (value: unknown) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
      throw new Error(`must be an integer >= 1, got ${String(value)}`);
    }
  },
});

/**
 * Custom convict format for required string validation.
 *
 * Rejects null (unset) and empty strings. When used with `default: null`,
 * convict's `config.validate()` will fail if the env var is not set.
 */
convict.addFormat({
  name: 'required-string',
  validate: (value: unknown) => {
    if (value === null || value === undefined) {
      throw new TypeError('must be set via environment variable');
    }
    if (typeof value !== 'string') {
      throw new TypeError('must be a string');
    }
    if (value.length === 0) {
      throw new TypeError('must not be empty');
    }
  },
});
