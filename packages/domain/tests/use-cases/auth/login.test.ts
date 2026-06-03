import { LoginUseCase } from '../../../src/use-cases/auth/login';
import { InMemoryUserRepository } from '../../ports/user/in-memory-user.repository';
import { User } from '../../../src/entities/user';
import { UserId } from '../../../src/value-objects/user-id';
import { Email } from '../../../src/value-objects/email';
import { Timestamps } from '../../../src/value-objects/timestamps';
import { PasswordHasher } from '../../../src/services/password-hasher';
import { randomUUID } from 'crypto';

const TEST_EMAIL = 'user@example.com';
const TEST_HASH = 'hashed-password';

function makePasswordHasher(valid: boolean): PasswordHasher {
  return {
    hash: jest.fn().mockResolvedValue(TEST_HASH),
    verify: jest.fn().mockResolvedValue(valid),
  } as unknown as PasswordHasher;
}

function makeUser(overrides: { isAdmin?: boolean; emailVerified?: boolean } = {}): User {
  return new User(
    UserId.create(randomUUID()),
    Email.create(TEST_EMAIL),
    'Test User',
    TEST_HASH,
    [],
    null,
    null,
    overrides.isAdmin ?? false,
    new Timestamps(),
    overrides.emailVerified ?? true,
    'SELF_REGISTERED',
  );
}

describe('LoginUseCase', () => {
  let userRepo: InMemoryUserRepository;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
  });

  test('returns error for unknown email', async () => {
    const useCase = new LoginUseCase(userRepo, makePasswordHasher(false));
    const result = await useCase.execute(Email.create(TEST_EMAIL), 'wrong');
    expect(result.success).toBe(false);
  });

  test('returns error for wrong password', async () => {
    await userRepo.save(makeUser());
    const useCase = new LoginUseCase(userRepo, makePasswordHasher(false));
    const result = await useCase.execute(Email.create(TEST_EMAIL), 'wrong');
    expect(result.success).toBe(false);
  });

  test('returns userId, emailVerified and isAdmin on success', async () => {
    const user = makeUser({ isAdmin: true, emailVerified: false });
    await userRepo.save(user);
    const useCase = new LoginUseCase(userRepo, makePasswordHasher(true));
    const result = await useCase.execute(Email.create(TEST_EMAIL), 'correct');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.userId).toBe(user.id.value);
      expect(result.value.isAdmin).toBe(true);
      expect(result.value.emailVerified).toBe(false);
    }
  });

  test('returns error when user has no password hash (SAML-only account)', async () => {
    const samlUser = new User(
      UserId.create(randomUUID()),
      Email.create(TEST_EMAIL),
      'SAML User',
      null,
      [],
      'saml|idp|user',
      null,
      false,
      new Timestamps(),
    );
    await userRepo.save(samlUser);
    const useCase = new LoginUseCase(userRepo, makePasswordHasher(true));
    const result = await useCase.execute(Email.create(TEST_EMAIL), 'any');
    expect(result.success).toBe(false);
  });
});
