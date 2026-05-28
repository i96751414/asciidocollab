describe('Session Encryption', () => {
  const originalEnv = process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY;
    } else {
      process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = originalEnv;
    }
  });

  test('encrypts and decrypts text with env var key', async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const { encrypt, decrypt } = await import('../src/services/session-encryption');
    const text = 'hello world';
    const encrypted = encrypt(text);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(text);
  });

  test('encrypts and decrypts text with generated key when env var not set', async () => {
    delete process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY;
    const { encrypt, decrypt } = await import('../src/services/session-encryption');
    const text = 'test data';
    const encrypted = encrypt(text);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(text);
  });

  test('encrypted output has correct format (iv:tag:ciphertext)', async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const { encrypt } = await import('../src/services/session-encryption');
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
    expect(parts[2]).toMatch(/^[0-9a-f]+$/);
  });

  test('throws on invalid hex key (too short)', async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = '0123456789abcdef';
    const { encrypt } = await import('../src/services/session-encryption');
    expect(() => encrypt('test')).toThrow('ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY must be a 64-character hexadecimal string');
  });

  test('throws on invalid hex key (too long)', async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01';
    const { encrypt } = await import('../src/services/session-encryption');
    expect(() => encrypt('test')).toThrow('ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY must be a 64-character hexadecimal string');
  });

  test('throws on non-hex key', async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
    const { encrypt } = await import('../src/services/session-encryption');
    expect(() => encrypt('test')).toThrow('ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY must be a 64-character hexadecimal string');
  });

  test('throws on key with special characters', async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdeg';
    const { encrypt } = await import('../src/services/session-encryption');
    expect(() => encrypt('test')).toThrow('ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY must be a 64-character hexadecimal string');
  });

  test('empty string key generates random key', async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = '';
    const { encrypt, decrypt } = await import('../src/services/session-encryption');
    const text = 'test data';
    const encrypted = encrypt(text);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(text);
  });

  test('different encryptions produce different ciphertext', async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const { encrypt } = await import('../src/services/session-encryption');
    const text = 'same text';
    const encrypted1 = encrypt(text);
    const encrypted2 = encrypt(text);
    expect(encrypted1).not.toBe(encrypted2);
  });

  test('decrypt fails with wrong key', async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const { encrypt } = await import('../src/services/session-encryption');
    const encrypted = encrypt('test');
    
    jest.resetModules();
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const { decrypt } = await import('../src/services/session-encryption');
    expect(() => decrypt(encrypted)).toThrow();
  });

  test('decrypt fails with tampered ciphertext', async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const { encrypt, decrypt } = await import('../src/services/session-encryption');
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    const tampered = parts[0] + ':' + parts[1] + ':' + 'ff' + parts[2].slice(2);
    expect(() => decrypt(tampered)).toThrow();
  });

  test('decrypt fails with tampered tag', async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const { encrypt, decrypt } = await import('../src/services/session-encryption');
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    const tampered = parts[0] + ':' + 'ff' + parts[1].slice(2) + ':' + parts[2];
    expect(() => decrypt(tampered)).toThrow();
  });

  test('decrypt fails with tampered IV', async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const { encrypt, decrypt } = await import('../src/services/session-encryption');
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    const tampered = 'ff' + parts[0].slice(2) + ':' + parts[1] + ':' + parts[2];
    expect(() => decrypt(tampered)).toThrow();
  });

  test('decrypt fails with invalid format (missing parts)', async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const { decrypt } = await import('../src/services/session-encryption');
    expect(() => decrypt('invalid')).toThrow();
  });

  test('decrypt fails with empty string', async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const { decrypt } = await import('../src/services/session-encryption');
    expect(() => decrypt('')).toThrow();
  });

  test('encrypts empty string', async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const { encrypt, decrypt } = await import('../src/services/session-encryption');
    const encrypted = encrypt('');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe('');
  });

  test('encrypts long text', async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const { encrypt, decrypt } = await import('../src/services/session-encryption');
    const text = 'a'.repeat(10000);
    const encrypted = encrypt(text);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(text);
  });

  test('encrypts special characters', async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const { encrypt, decrypt } = await import('../src/services/session-encryption');
    const text = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const encrypted = encrypt(text);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(text);
  });

  test('encrypts unicode', async () => {
    process.env.ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const { encrypt, decrypt } = await import('../src/services/session-encryption');
    const text = 'こんにちは世界';
    const encrypted = encrypt(text);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(text);
  });
});
