// T035: Failing domain unit tests for ConfirmEmailChangeUseCase
import { ConfirmEmailChangeUseCase } from '../../../src/use-cases/auth/confirm-email-change';
import { User } from '../../../src/entities/user';
import { UserId } from '../../../src/value-objects/user-id';
import { Email } from '../../../src/value-objects/email';
import { Timestamps } from '../../../src/value-objects/timestamps';
import { EmailChangeToken } from '../../../src/entities/email-change-token';
import { EmailChangeTokenId } from '../../../src/value-objects/email-change-token-id';
import { InMemoryEmailChangeTokenRepository } from '../../ports/auth-tokens/in-memory-email-change-token.repository';
import { UserRepository } from '../../../src/ports/user/user.repository';
import { TokenGenerator } from '../../../src/services/token-generator';

const USER_ID = UserId.create('550e8400-e29b-41d4-a716-446655440000');

function createTestUser(): User {
  return new User(
    USER_ID,
    Email.create('old@example.com'),
    'Test User',
    'password-hash',
    [],
    null,
    null,
    false,
    new Timestamps(),
  );
}

function makeTokenGenerator(rawToken = 'raw-token'): TokenGenerator {
  return {
    generatePasswordResetToken: jest.fn(),
    hashToken: jest.fn().mockReturnValue(`hashed-${rawToken}`),
  };
}

function createValidToken(tokenHash = 'hashed-raw-token'): EmailChangeToken {
  return new EmailChangeToken(
    EmailChangeTokenId.create('550e8400-e29b-41d4-a716-446655440001'),
    USER_ID,
    tokenHash,
    'new@example.com',
    new Date(Date.now() + 3_600_000),
    null,
  );
}

describe('ConfirmEmailChangeUseCase', () => {
  let tokenRepo: InMemoryEmailChangeTokenRepository;
  let userRepo: UserRepository;
  let tokenGenerator: TokenGenerator;
  let useCase: ConfirmEmailChangeUseCase;

  beforeEach(() => {
    tokenRepo = new InMemoryEmailChangeTokenRepository();
    const testUser = createTestUser();
    userRepo = {
      findById: jest.fn().mockResolvedValue(testUser),
      findByEmail: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      hasAny: jest.fn(),
    } as unknown as UserRepository;
    tokenGenerator = makeTokenGenerator('raw-token');
    useCase = new ConfirmEmailChangeUseCase(tokenRepo, userRepo, tokenGenerator);
  });

  test('happy path updates user email to pendingEmail and marks token used', async () => {
    const token = createValidToken('hashed-raw-token');
    await tokenRepo.save(token);

    const result = await useCase.execute('raw-token');
    expect(result.success).toBe(true);

    const markedToken = await tokenRepo.findByTokenHash('hashed-raw-token');
    expect(markedToken?.isUsed).toBe(true);

    const savedUser = (userRepo.save as jest.Mock).mock.calls[0][0] as User;
    expect(savedUser.email.value).toBe('new@example.com');
  });

  test('expired token returns InvalidTokenError', async () => {
    const expiredToken = new EmailChangeToken(
      EmailChangeTokenId.create('550e8400-e29b-41d4-a716-446655440001'),
      USER_ID,
      'hashed-raw-token',
      'new@example.com',
      new Date(Date.now() - 1000),
      null,
    );
    await tokenRepo.save(expiredToken);

    const result = await useCase.execute('raw-token');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.name).toBe('InvalidTokenError');
    }
  });

  test('already-used token returns InvalidTokenError', async () => {
    const usedToken = new EmailChangeToken(
      EmailChangeTokenId.create('550e8400-e29b-41d4-a716-446655440001'),
      USER_ID,
      'hashed-raw-token',
      'new@example.com',
      new Date(Date.now() + 3_600_000),
      new Date(),
    );
    await tokenRepo.save(usedToken);

    const result = await useCase.execute('raw-token');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.name).toBe('InvalidTokenError');
    }
  });

  test('token not found returns InvalidTokenError', async () => {
    const result = await useCase.execute('nonexistent-token');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.name).toBe('InvalidTokenError');
    }
  });
});
