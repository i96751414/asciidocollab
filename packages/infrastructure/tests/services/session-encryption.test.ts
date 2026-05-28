import { SessionEncryption } from '../../src/services/session-encryption';

describe('Session Encryption', () => {
  test('encrypts and decrypts text with provided key', () => {
    const encryption = new SessionEncryption({
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    const text = 'hello world';
    const encrypted = encryption.encrypt(text);
    const decrypted = encryption.decrypt(encrypted);
    expect(decrypted).toBe(text);
  });

  test('encrypts and decrypts text with generated key when empty', () => {
    const encryption = new SessionEncryption({ encryptionKey: '' });
    const text = 'test data';
    const encrypted = encryption.encrypt(text);
    const decrypted = encryption.decrypt(encrypted);
    expect(decrypted).toBe(text);
  });

  test('encrypted output has correct format (iv:tag:ciphertext)', () => {
    const encryption = new SessionEncryption({
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    const encrypted = encryption.encrypt('test');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
    expect(parts[2]).toMatch(/^[0-9a-f]+$/);
  });

  test('throws on invalid hex key (too short)', () => {
    const encryption = new SessionEncryption({
      encryptionKey: '0123456789abcdef',
    });
    expect(() => encryption.encrypt('test')).toThrow('Encryption key must be a 64-character hexadecimal string');
  });

  test('throws on invalid hex key (too long)', () => {
    const encryption = new SessionEncryption({
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01',
    });
    expect(() => encryption.encrypt('test')).toThrow('Encryption key must be a 64-character hexadecimal string');
  });

  test('throws on non-hex key', () => {
    const encryption = new SessionEncryption({
      encryptionKey: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
    });
    expect(() => encryption.encrypt('test')).toThrow('Encryption key must be a 64-character hexadecimal string');
  });

  test('throws on key with special characters', () => {
    const encryption = new SessionEncryption({
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdeg',
    });
    expect(() => encryption.encrypt('test')).toThrow('Encryption key must be a 64-character hexadecimal string');
  });

  test('different encryptions produce different ciphertext', () => {
    const encryption = new SessionEncryption({
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    const text = 'same text';
    const encrypted1 = encryption.encrypt(text);
    const encrypted2 = encryption.encrypt(text);
    expect(encrypted1).not.toBe(encrypted2);
  });

  test('decrypt fails with wrong key', () => {
    const encryption1 = new SessionEncryption({
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    const encrypted = encryption1.encrypt('test');

    const encryption2 = new SessionEncryption({
      encryptionKey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    expect(() => encryption2.decrypt(encrypted)).toThrow();
  });

  test('decrypt fails with tampered ciphertext', () => {
    const encryption = new SessionEncryption({
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    const encrypted = encryption.encrypt('test');
    const parts = encrypted.split(':');
    const tampered = parts[0] + ':' + parts[1] + ':' + 'ff' + parts[2].slice(2);
    expect(() => encryption.decrypt(tampered)).toThrow();
  });

  test('decrypt fails with tampered tag', () => {
    const encryption = new SessionEncryption({
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    const encrypted = encryption.encrypt('test');
    const parts = encrypted.split(':');
    const tampered = parts[0] + ':' + 'ff' + parts[1].slice(2) + ':' + parts[2];
    expect(() => encryption.decrypt(tampered)).toThrow();
  });

  test('decrypt fails with tampered IV', () => {
    const encryption = new SessionEncryption({
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    const encrypted = encryption.encrypt('test');
    const parts = encrypted.split(':');
    const tampered = 'ff' + parts[0].slice(2) + ':' + parts[1] + ':' + parts[2];
    expect(() => encryption.decrypt(tampered)).toThrow();
  });

  test('decrypt fails with invalid format (missing parts)', () => {
    const encryption = new SessionEncryption({
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    expect(() => encryption.decrypt('invalid')).toThrow();
  });

  test('decrypt fails with empty string', () => {
    const encryption = new SessionEncryption({
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    expect(() => encryption.decrypt('')).toThrow();
  });

  test('encrypts empty string', () => {
    const encryption = new SessionEncryption({
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    const encrypted = encryption.encrypt('');
    const decrypted = encryption.decrypt(encrypted);
    expect(decrypted).toBe('');
  });

  test('encrypts long text', () => {
    const encryption = new SessionEncryption({
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    const text = 'a'.repeat(10_000);
    const encrypted = encryption.encrypt(text);
    const decrypted = encryption.decrypt(encrypted);
    expect(decrypted).toBe(text);
  });

  test('encrypts special characters', () => {
    const encryption = new SessionEncryption({
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    const text = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const encrypted = encryption.encrypt(text);
    const decrypted = encryption.decrypt(encrypted);
    expect(decrypted).toBe(text);
  });

  test('encrypts unicode', () => {
    const encryption = new SessionEncryption({
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    const text = 'こんにちは世界';
    const encrypted = encryption.encrypt(text);
    const decrypted = encryption.decrypt(encrypted);
    expect(decrypted).toBe(text);
  });
});
