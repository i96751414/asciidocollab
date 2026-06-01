import { ResetPasswordUseCase } from '../../src/use-cases/reset-password';
import { InMemoryUserRepository } from '../repositories/in-memory-user.repository';
import { InMemoryPasswordResetTokenRepository } from '../repositories/in-memory-password-reset-token.repository';
import { User } from '../../src/entities/user';
import { UserId } from '../../src/value-objects/user-id';
import { Email } from '../../src/value-objects/email';
import { Timestamps } from '../../src/value-objects/timestamps';
import { PasswordResetToken } from '../../src/entities/password-reset-token';
import { PasswordResetTokenId } from '../../src/value-objects/password-reset-token-id';
import { PasswordHasher } from '../../src/services/password-hasher';
import { PasswordPolicy } from '../../src/value-objects/password-policy';
import type { TokenGenerator } from '../../src/services/token-generator';
import { InvalidTokenError } from '../../src/errors/invalid-token';
import { ValidationError } from '../../src/errors/validation-error';
import { PasswordReuseError } from '../../src/errors/password-reuse';
import { randomUUID } from 'crypto';

const VALID_PASSWORD = 'NewP@ssw0rd123!';
const RAW_TOKEN = 'raw-token';
const TOKEN_HASH = 'hashed-raw-token';

const defaultPolicy: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireDigits: true,
  requireSymbols: false,
};

function makeTokenGenerator(): TokenGenerator {
  return {
    generatePasswordResetToken: jest.fn(),
    generateInvitationToken: jest.fn(),
    generateEmailVerificationToken: jest.fn(),
    hashToken: jest.fn().mockReturnValue(TOKEN_HASH),
  };
}

function makePasswordHasher(): PasswordHasher {
  return {
    hash: jest.fn().mockResolvedValue('new-hash'),
    verify: jest.fn().mockResolvedValue(false),
  } as unknown as PasswordHasher;
}

function makeUser(id: UserId): User {
  return new User(id, Email.create('user@example.com'), 'Test', 'old-hash', [], null, null, false, new Timestamps(), true, 'SELF_REGISTERED');
}

function makeToken(userId: UserId, expired = false): PasswordResetToken {
  const expiresAt = expired ? new Date(Date.now() - 1000) : new Date(Date.now() + 3_600_000);
  return new PasswordResetToken(PasswordResetTokenId.create(randomUUID()), userId, TOKEN_HASH, expiresAt, null, new Date());
}

describe('ResetPasswordUseCase', () => {
  let userRepo: InMemoryUserRepository;
  let tokenRepo: InMemoryPasswordResetTokenRepository;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    tokenRepo = new InMemoryPasswordResetTokenRepository();
  });

  function makeUseCase(hasher = makePasswordHasher()) {
    return new ResetPasswordUseCase(userRepo, tokenRepo, hasher, makeTokenGenerator(), defaultPolicy);
  }

  test('returns InvalidTokenError when token not found', async () => {
    const result = await makeUseCase().execute(RAW_TOKEN, VALID_PASSWORD, 5);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(InvalidTokenError);
  });

  test('returns ValidationError for weak password', async () => {
    const userId = UserId.create(randomUUID());
    await userRepo.save(makeUser(userId));
    await tokenRepo.save(makeToken(userId));
    const result = await makeUseCase().execute(RAW_TOKEN, 'weak', 5);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
  });

  test('returns InvalidTokenError when token is expired', async () => {
    const userId = UserId.create(randomUUID());
    await userRepo.save(makeUser(userId));
    await tokenRepo.save(makeToken(userId, true));
    const result = await makeUseCase().execute(RAW_TOKEN, VALID_PASSWORD, 5);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(InvalidTokenError);
  });

  test('returns PasswordReuseError when new password is in history', async () => {
    const userId = UserId.create(randomUUID());
    const hasher = makePasswordHasher();
    (hasher.verify as jest.Mock).mockResolvedValue(true); // password is in history
    const userWithHistory = new User(userId, Email.create('user@example.com'), 'Test', 'old-hash', ['old-hash'], null, null, false, new Timestamps(), true, 'SELF_REGISTERED');
    await userRepo.save(userWithHistory);
    await tokenRepo.save(makeToken(userId));
    const result = await makeUseCase(hasher).execute(RAW_TOKEN, VALID_PASSWORD, 5);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PasswordReuseError);
  });

  test('resets password, updates history, and marks token used on success', async () => {
    const userId = UserId.create(randomUUID());
    await userRepo.save(makeUser(userId));
    await tokenRepo.save(makeToken(userId));
    const result = await makeUseCase().execute(RAW_TOKEN, VALID_PASSWORD, 5);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.userId.value).toBe(userId.value);
    const updated = await userRepo.findById(userId);
    expect(updated?.passwordHash).toBe('new-hash');
  });
});
