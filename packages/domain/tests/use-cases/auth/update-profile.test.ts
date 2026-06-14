import { UpdateProfileUseCase } from '../../../src/use-cases/auth/update-profile';
import { User } from '../../../src/entities/user';
import { UserId } from '../../../src/value-objects/ids/user-id';
import { Email } from '../../../src/value-objects/identity/email';
import { Timestamps } from '../../../src/value-objects/common/timestamps';
import { InMemoryUserRepository } from '../../ports/user/in-memory-user.repository';

function createTestUser(): User {
  return new User(
    UserId.create('550e8400-e29b-41d4-a716-446655440000'),
    Email.create('test@example.com'),
    'Original Name',
    'password-hash',
    [],
    null,
    null,
    false,
    new Timestamps(),
    true,
    'SELF_REGISTERED',
    null,
    'system',
  );
}

describe('UpdateProfileUseCase', () => {
  const userId = UserId.create('550e8400-e29b-41d4-a716-446655440000');
  let userRepo: InMemoryUserRepository;
  let useCase: UpdateProfileUseCase;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    await userRepo.save(createTestUser());
    useCase = new UpdateProfileUseCase(userRepo);
  });

  test('updates displayName only when only displayName is provided', async () => {
    const result = await useCase.execute({ userId, displayName: 'New Name' });
    expect(result.success).toBe(true);
    const saved = await userRepo.findById(userId);
    expect(saved?.displayName).toBe('New Name');
    expect(saved?.avatarKey).toBeNull();
    expect(saved?.appTheme).toBe('system');
  });

  test('updates avatarKey only when only avatarKey is provided', async () => {
    const result = await useCase.execute({ userId, avatarKey: 'bottts-neutral' });
    expect(result.success).toBe(true);
    const saved = await userRepo.findById(userId);
    expect(saved?.displayName).toBe('Original Name');
    expect(saved?.avatarKey).toBe('bottts-neutral');
    expect(saved?.appTheme).toBe('system');
  });

  test('updates appTheme only when only appTheme is provided', async () => {
    const result = await useCase.execute({ userId, appTheme: 'dark' });
    expect(result.success).toBe(true);
    const saved = await userRepo.findById(userId);
    expect(saved?.displayName).toBe('Original Name');
    expect(saved?.appTheme).toBe('dark');
  });

  test('updates all fields when all are provided', async () => {
    const result = await useCase.execute({ userId, displayName: 'New Name', avatarKey: 'initial-face', appTheme: 'light' });
    expect(result.success).toBe(true);
    const saved = await userRepo.findById(userId);
    expect(saved?.displayName).toBe('New Name');
    expect(saved?.avatarKey).toBe('initial-face');
    expect(saved?.appTheme).toBe('light');
  });

  test('rejects appTheme value outside allowed set', async () => {
    const result = await useCase.execute({ userId, appTheme: 'blue' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.name).toBe('ValidationError');
    }
  });

  test('allows setting avatarKey to null', async () => {
    await useCase.execute({ userId, avatarKey: 'initial-face' });
    const result = await useCase.execute({ userId, avatarKey: null });
    expect(result.success).toBe(true);
    const saved = await userRepo.findById(userId);
    expect(saved?.avatarKey).toBeNull();
  });

  test('returns UserNotFoundError when user does not exist', async () => {
    const unknownId = UserId.create('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    const result = await useCase.execute({ userId: unknownId, displayName: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.name).toBe('UserNotFoundError');
    }
  });
});
