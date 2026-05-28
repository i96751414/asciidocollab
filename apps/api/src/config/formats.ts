import convict from 'convict';

/**
 * Custom convict format for hostname validation.
 */
convict.addFormat({
  name: 'hostname',
  validate: (value: unknown) => {
    if (typeof value !== 'string') {
      throw new Error('must be a string');
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
 * Custom convict format for required string validation.
 *
 * Rejects null (unset) and empty strings. When used with `default: null`,
 * convict's `config.validate()` will fail if the env var is not set.
 */
convict.addFormat({
  name: 'required-string',
  validate: (value: unknown) => {
    if (value === null || value === undefined) {
      throw new Error('must be set via environment variable');
    }
    if (typeof value !== 'string') {
      throw new Error('must be a string');
    }
    if (value.length === 0) {
      throw new Error('must not be empty');
    }
  },
});
