import { EmailVerificationToken } from '../../src/entities/email-verification-token';
import { EmailVerificationTokenId } from '../../src/value-objects/ids/email-verification-token-id';
import { UserId } from '../../src/value-objects/ids/user-id';
import { randomUUID } from 'crypto';

function makeToken(overrides?: Partial<{
  usedAt: Date | null;
  expiresAt: Date;
}>) {
  return new EmailVerificationToken(
    EmailVerificationTokenId.create(randomUUID()),
    UserId.create(randomUUID()),
    'sha256hashvalue',
    overrides?.expiresAt ?? new Date(Date.now() + 86_400_000),
    overrides?.usedAt ?? null,
    new Date(),
  );
}

describe('EmailVerificationToken', () => {
  describe('isUsed', () => {
    test('returns false when usedAt is null', () => {
      const token = makeToken({ usedAt: null });
      expect(token.isUsed).toBe(false);
    });

    test('returns true when usedAt is set', () => {
      const token = makeToken({ usedAt: new Date() });
      expect(token.isUsed).toBe(true);
    });
  });

  describe('isExpired', () => {
    test('returns false when expiresAt is in the future', () => {
      const token = makeToken({ expiresAt: new Date(Date.now() + 3_600_000) });
      expect(token.isExpired).toBe(false);
    });

    test('returns true when expiresAt is in the past', () => {
      const token = makeToken({ expiresAt: new Date(Date.now() - 1000) });
      expect(token.isExpired).toBe(true);
    });
  });

  describe('isValid', () => {
    test('returns true when not used and not expired', () => {
      const token = makeToken({
        usedAt: null,
        expiresAt: new Date(Date.now() + 3_600_000),
      });
      expect(token.isValid).toBe(true);
    });

    test('returns false when already used', () => {
      const token = makeToken({
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
      });
      expect(token.isValid).toBe(false);
    });

    test('returns false when expired', () => {
      const token = makeToken({
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(token.isValid).toBe(false);
    });

    test('returns false when both used and expired', () => {
      const token = makeToken({
        usedAt: new Date(Date.now() - 1000),
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(token.isValid).toBe(false);
    });
  });
});
