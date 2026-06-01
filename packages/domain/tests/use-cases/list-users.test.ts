import { ListUsersUseCase } from '../../src/use-cases/list-users';
import { InMemoryUserRepository } from '../repositories/in-memory-user.repository';
import { User } from '../../src/entities/user';
import { UserId } from '../../src/value-objects/user-id';
import { Email } from '../../src/value-objects/email';
import { Timestamps } from '../../src/value-objects/timestamps';
import { PermissionDeniedError } from '../../src/errors/permission-denied';
import { randomUUID } from 'crypto';

function makeUser(isAdmin = false): User {
  return new User(
    UserId.create(randomUUID()),
    Email.create(`user-${randomUUID()}@example.com`),
    'Test User',
    'hash',
    [],
    null,
    null,
    isAdmin,
    new Timestamps(),
    true,
    'SELF_REGISTERED',
  );
}

describe('ListUsersUseCase', () => {
  let userRepo: InMemoryUserRepository;
  let useCase: ListUsersUseCase;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    useCase = new ListUsersUseCase(userRepo);
  });

  test('returns PermissionDeniedError when actor is not admin', async () => {
    const nonAdmin = makeUser(false);
    await userRepo.save(nonAdmin);

    const result = await useCase.execute(nonAdmin.id);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
  });

  test('returns all users when actor is admin', async () => {
    const admin = makeUser(true);
    const user1 = makeUser(false);
    const user2 = makeUser(false);
    await userRepo.save(admin);
    await userRepo.save(user1);
    await userRepo.save(user2);

    const result = await useCase.execute(admin.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.users).toHaveLength(3);
    }
  });
});
