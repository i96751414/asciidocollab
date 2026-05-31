// T034: Failing domain unit tests for RequestEmailChangeUseCase
import { RequestEmailChangeUseCase } from '../../src/use-cases/request-email-change';
import { User } from '../../src/entities/user';
import { UserId } from '../../src/value-objects/user-id';
import { Email } from '../../src/value-objects/email';
import { Timestamps } from '../../src/value-objects/timestamps';
import { EmailChangeToken } from '../../src/entities/email-change-token';
import { EmailChangeTokenId } from '../../src/value-objects/email-change-token-id';
import { InMemoryEmailChangeTokenRepository } from '../repositories/in-memory-email-change-token.repository';
import { UserRepository } from '../../src/repositories/user.repository';
import { TokenGenerator } from '../../src/services/token-generator';

const USER_ID = UserId.create('550e8400-e29b-41d4-a716-446655440000');
const CURRENT_EMAIL = 'user@example.com';

function createTestUser(email = CURRENT_EMAIL): User {
  return new User(
    USER_ID,
    Email.create(email),
    'Test User',
    'password-hash',
    [],
    null,
    null,
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

describe('RequestEmailChangeUseCase', () => {
  let tokenRepo: InMemoryEmailChangeTokenRepository;
  let userRepo: UserRepository;
  let tokenGenerator: TokenGenerator;
  let useCase: RequestEmailChangeUseCase;

  beforeEach(() => {
    tokenRepo = new InMemoryEmailChangeTokenRepository();
    const testUser = createTestUser();
    userRepo = {
      findById: jest.fn().mockResolvedValue(testUser),
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      hasAny: jest.fn(),
    } as unknown as UserRepository;
    tokenGenerator = makeTokenGenerator();
    useCase = new RequestEmailChangeUseCase(userRepo, tokenRepo, tokenGenerator);
  });

  test('happy path creates token with pendingEmail', async () => {
    const result = await useCase.execute(USER_ID, 'new@example.com');
    expect(result.success).toBe(true);
    const active = await tokenRepo.findActiveByUserId(USER_ID);
    expect(active).not.toBeNull();
    expect(active?.pendingEmail).toBe('new@example.com');
  });

  test('supersedes existing active token when new request made', async () => {
    // Seed an existing active token
    const oldToken = new EmailChangeToken(
      EmailChangeTokenId.create('550e8400-e29b-41d4-a716-446655440001'),
      USER_ID,
      'old-hash',
      'old@example.com',
      new Date(Date.now() + 3_600_000),
      null,
    );
    await tokenRepo.save(oldToken);

    const result = await useCase.execute(USER_ID, 'newer@example.com');
    expect(result.success).toBe(true);

    // Old token should be gone
    const byOldHash = await tokenRepo.findByTokenHash('old-hash');
    expect(byOldHash).toBeNull();

    const active = await tokenRepo.findActiveByUserId(USER_ID);
    expect(active?.pendingEmail).toBe('newer@example.com');
  });

  test('returns success (no error) when newEmail is already registered (enumeration prevention)', async () => {
    (userRepo.findByEmail as jest.Mock).mockResolvedValue(createTestUser('new@example.com'));
    const result = await useCase.execute(USER_ID, 'new@example.com');
    expect(result.success).toBe(true);
    // No token created since email is taken
    const active = await tokenRepo.findActiveByUserId(USER_ID);
    expect(active).toBeNull();
  });

  test('returns success when newEmail equals current email (noop)', async () => {
    const result = await useCase.execute(USER_ID, CURRENT_EMAIL);
    expect(result.success).toBe(true);
    const active = await tokenRepo.findActiveByUserId(USER_ID);
    expect(active).toBeNull();
  });
});
