import '../../src/config/formats';
import convict from 'convict';

function makeHostnameConfig() {
  return convict({
    value: { format: 'hostname', default: '' as string, env: 'FORMATS_TEST_HOSTNAME_' + Math.random() },
  });
}

function makeRequiredStringConfig() {
  return convict({
    value: { format: 'required-string', default: null as unknown as string, env: 'FORMATS_TEST_REQ_' + Math.random() },
  });
}

describe('hostname format', () => {
  it('accepts an empty string (bind to all interfaces)', () => {
    const cfg = makeHostnameConfig();
    cfg.set('value', '');
    expect(() => cfg.validate({ allowed: 'strict' })).not.toThrow();
  });

  it('accepts a valid hostname', () => {
    const cfg = makeHostnameConfig();
    cfg.set('value', 'example.com');
    expect(() => cfg.validate({ allowed: 'strict' })).not.toThrow();
  });

  it('accepts localhost', () => {
    const cfg = makeHostnameConfig();
    cfg.set('value', 'localhost');
    expect(() => cfg.validate({ allowed: 'strict' })).not.toThrow();
  });

  it('accepts 0.0.0.0', () => {
    const cfg = makeHostnameConfig();
    cfg.set('value', '0.0.0.0');
    expect(() => cfg.validate({ allowed: 'strict' })).not.toThrow();
  });

  it('rejects a non-string value', () => {
    const cfg = makeHostnameConfig();
    cfg.set('value', 42 as never);
    expect(() => cfg.validate({ allowed: 'strict' })).toThrow('must be a string');
  });

  it('rejects an invalid hostname string', () => {
    const cfg = makeHostnameConfig();
    cfg.set('value', 'not a valid hostname!!');
    expect(() => cfg.validate({ allowed: 'strict' })).toThrow('must be a valid hostname');
  });
});

describe('required-string format', () => {
  it('accepts a non-empty string', () => {
    const cfg = makeRequiredStringConfig();
    cfg.set('value', 'hello');
    expect(() => cfg.validate({ allowed: 'strict' })).not.toThrow();
  });

  it('rejects null', () => {
    const cfg = makeRequiredStringConfig();
    expect(() => cfg.validate({ allowed: 'strict' })).toThrow('must be set');
  });

  it('rejects an empty string', () => {
    const cfg = makeRequiredStringConfig();
    cfg.set('value', '');
    expect(() => cfg.validate({ allowed: 'strict' })).toThrow('must not be empty');
  });

  it('rejects a non-string value', () => {
    const cfg = makeRequiredStringConfig();
    cfg.set('value', 123 as never);
    expect(() => cfg.validate({ allowed: 'strict' })).toThrow('must be a string');
  });
});
