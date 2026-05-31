// T029: Failing domain unit tests for EmailChangeToken entity
import { EmailChangeToken } from '../../src/entities/email-change-token';
import { EmailChangeTokenId } from '../../src/value-objects/email-change-token-id';
import { UserId } from '../../src/value-objects/user-id';

function createToken(
  overrides: Partial<{
    usedAt: Date | null;
    expiresAt: Date;
  }> = {},
): EmailChangeToken {
  return new EmailChangeToken(
    EmailChangeTokenId.create('550e8400-e29b-41d4-a716-446655440000'),
    UserId.create('550e8400-e29b-41d4-a716-446655440001'),
    'sha256-hash',
    'pending@example.com',
    overrides.expiresAt ?? new Date(Date.now() + 3_600_000),
    overrides.usedAt ?? null,
    new Date(),
  );
}

describe('EmailChangeToken', () => {
  test('isUsed is true when usedAt is set', () => {
    const token = createToken({ usedAt: new Date() });
    expect(token.isUsed).toBe(true);
  });

  test('isUsed is false when usedAt is null', () => {
    const token = createToken({ usedAt: null });
    expect(token.isUsed).toBe(false);
  });

  test('isExpired is true when expiresAt is in the past', () => {
    const token = createToken({ expiresAt: new Date(Date.now() - 1000) });
    expect(token.isExpired).toBe(true);
  });

  test('isExpired is false when expiresAt is in the future', () => {
    const token = createToken({ expiresAt: new Date(Date.now() + 3_600_000) });
    expect(token.isExpired).toBe(false);
  });

  test('isValid is false when used', () => {
    const token = createToken({ usedAt: new Date() });
    expect(token.isValid).toBe(false);
  });

  test('isValid is false when expired', () => {
    const token = createToken({ expiresAt: new Date(Date.now() - 1000) });
    expect(token.isValid).toBe(false);
  });

  test('isValid is true when unused and not expired', () => {
    const token = createToken();
    expect(token.isValid).toBe(true);
  });
});
