// T022: Failing domain unit tests for UpdateDisplayNameUseCase
import { UpdateDisplayNameUseCase } from '../../src/use-cases/update-display-name';
import { User } from '../../src/entities/user';
import { UserId } from '../../src/value-objects/user-id';
import { Email } from '../../src/value-objects/email';
import { Timestamps } from '../../src/value-objects/timestamps';
import { UserRepository } from '../../src/ports/user/user.repository';

function createTestUser(displayName = 'Original Name'): User {
  return new User(
    UserId.create('550e8400-e29b-41d4-a716-446655440000'),
    Email.create('test@example.com'),
    displayName,
    'password-hash',
    [],
    null,
    null,
    false,
    new Timestamps(),
  );
}

describe('UpdateDisplayNameUseCase', () => {
  let userRepo: UserRepository;
  let useCase: UpdateDisplayNameUseCase;
  const userId = UserId.create('550e8400-e29b-41d4-a716-446655440000');

  beforeEach(() => {
    const testUser = createTestUser();
    userRepo = {
      findById: jest.fn().mockResolvedValue(testUser),
      findByEmail: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      hasAny: jest.fn(),
    } as unknown as UserRepository;
    useCase = new UpdateDisplayNameUseCase(userRepo);
  });

  test('happy path updates user displayName', async () => {
    const result = await useCase.execute(userId, 'New Name');
    expect(result.success).toBe(true);
    const savedUser = (userRepo.save as jest.Mock).mock.calls[0][0] as User;
    expect(savedUser.displayName).toBe('New Name');
  });

  test('empty string returns ValidationError', async () => {
    const result = await useCase.execute(userId, '');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.name).toBe('ValidationError');
    }
  });

  test('name exceeding 100 characters returns ValidationError', async () => {
    const longName = 'a'.repeat(101);
    const result = await useCase.execute(userId, longName);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.name).toBe('ValidationError');
    }
  });

  test('non-existent userId returns NotFoundError', async () => {
    (userRepo.findById as jest.Mock).mockResolvedValue(null);
    const result = await useCase.execute(userId, 'Valid Name');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.name).toBe('UserNotFoundError');
    }
  });

  test('name of exactly 100 characters is accepted', async () => {
    const maxName = 'a'.repeat(100);
    const result = await useCase.execute(userId, maxName);
    expect(result.success).toBe(true);
  });
});
