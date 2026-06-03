import { RequestPasswordResetUseCase } from '../../../src/use-cases/auth/request-password-reset';
import { User } from '../../../src/entities/user';
import { UserId } from '../../../src/value-objects/user-id';
import { Email } from '../../../src/value-objects/email';
import { Timestamps } from '../../../src/value-objects/timestamps';
import { UserRepository } from '../../../src/ports/user/user.repository';
import { TokenGenerator } from '../../../src/services/token-generator';
import { PasswordResetNotifier } from '../../../src/services/password-reset-notifier';
import { InMemoryPasswordResetTokenRepository } from '../../ports/auth-tokens/in-memory-password-reset-token.repository';

const USER_ID = UserId.create('550e8400-e29b-41d4-a716-446655440000');
const TEST_EMAIL = 'user@example.com';

function createTestUser(): User {
  return new User(
    USER_ID,
    Email.create(TEST_EMAIL),
    'Test User',
    'password-hash',
    [],
    null,
    null,
    false,
    new Timestamps(),
  );
}

function makeTokenGenerator(): TokenGenerator {
  return {
    generatePasswordResetToken: jest.fn().mockReturnValue({
      token: 'raw-token',
      hashedToken: 'hashed-token',
      expiresAt: new Date(Date.now() + 3_600_000),
    }),
    hashToken: jest.fn().mockReturnValue('hashed-token'),
  };
}

function makeNotifier(): jest.Mocked<PasswordResetNotifier> {
  return { sendResetEmail: jest.fn().mockResolvedValue(undefined) };
}

describe('RequestPasswordResetUseCase', () => {
  let tokenRepo: InMemoryPasswordResetTokenRepository;
  let userRepo: UserRepository;
  let tokenGenerator: TokenGenerator;
  let notifier: jest.Mocked<PasswordResetNotifier>;

  beforeEach(() => {
    tokenRepo = new InMemoryPasswordResetTokenRepository();
    userRepo = {
      findByEmail: jest.fn().mockResolvedValue(createTestUser()),
      findById: jest.fn(),
      save: jest.fn(),
      hasAny: jest.fn(),
    } as unknown as UserRepository;
    tokenGenerator = makeTokenGenerator();
    notifier = makeNotifier();
  });

  test('known user: saves token and sends reset email', async () => {
    const useCase = new RequestPasswordResetUseCase(userRepo, tokenRepo, tokenGenerator, notifier);
    const result = await useCase.execute(Email.create(TEST_EMAIL));

    expect(result.success).toBe(true);
    const saved = await tokenRepo.findByTokenHash('hashed-token');
    expect(saved).not.toBeNull();
    expect(notifier.sendResetEmail).toHaveBeenCalledWith(TEST_EMAIL, 'raw-token');
  });

  test('unknown user: no token saved, notifier not called', async () => {
    (userRepo.findByEmail as jest.Mock).mockResolvedValue(null);
    const useCase = new RequestPasswordResetUseCase(userRepo, tokenRepo, tokenGenerator, notifier);
    const result = await useCase.execute(Email.create('ghost@example.com'));

    expect(result.success).toBe(true);
    const saved = await tokenRepo.findByTokenHash('hashed-token');
    expect(saved).toBeNull();
    expect(notifier.sendResetEmail).not.toHaveBeenCalled();
  });

  test('SMTP failure: notifier throws, use case still returns success', async () => {
    notifier.sendResetEmail.mockRejectedValue(new Error('SMTP down'));
    const useCase = new RequestPasswordResetUseCase(userRepo, tokenRepo, tokenGenerator, notifier);
    const result = await useCase.execute(Email.create(TEST_EMAIL));

    expect(result.success).toBe(true);
  });
});
