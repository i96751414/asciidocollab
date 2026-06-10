import { ListFailedSignInAttemptsUseCase } from '../../../src/use-cases/admin/list-failed-sign-ins';
import { AUTH_ATTEMPT_FAILED_SIGN_IN } from '../../../src/entities/auth-attempt-telemetry';
import { InMemoryAuthAttemptTelemetryRepository } from '../../ports/admin/in-memory-auth-attempt-telemetry.repository';
import { InMemoryUserRepository } from '../../ports/user/in-memory-user.repository';
import { User } from '../../../src/entities/user';
import { UserId } from '../../../src/value-objects/user-id';
import { Email } from '../../../src/value-objects/email';
import { Timestamps } from '../../../src/value-objects/timestamps';
import { PermissionDeniedError } from '../../../src/errors/permission-denied';
import { randomUUID } from 'crypto';

function makeUser(isAdmin: boolean): User {
  return new User(
    UserId.create(randomUUID()),
    Email.create(`${randomUUID()}@example.com`),
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

describe('ListFailedSignInAttemptsUseCase', () => {
  let repo: InMemoryAuthAttemptTelemetryRepository;
  let userRepo: InMemoryUserRepository;
  let useCase: ListFailedSignInAttemptsUseCase;

  beforeEach(() => {
    repo = new InMemoryAuthAttemptTelemetryRepository();
    userRepo = new InMemoryUserRepository();
    useCase = new ListFailedSignInAttemptsUseCase(repo, userRepo);
  });

  test('denies non-admin callers', async () => {
    const user = makeUser(false);
    await userRepo.save(user);
    const result = await useCase.execute(user.id, {}, { page: 1, limit: 50 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(PermissionDeniedError);
    }
  });

  test('returns a paged result for admins', async () => {
    const admin = makeUser(true);
    await userRepo.save(admin);
    const now = new Date('2026-06-10T12:00:00.000Z');
    await repo.record({ eventType: AUTH_ATTEMPT_FAILED_SIGN_IN, identifier: 'a@x.com', ipAddress: '1.1.1.1', userAgent: null, windowStart: now, now });

    const result = await useCase.execute(admin.id, {}, { page: 1, limit: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.total).toBe(1);
      expect(result.value.items[0].identifier).toBe('a@x.com');
    }
  });

  test('clamps a non-positive page to 1 (no negative skip)', async () => {
    const admin = makeUser(true);
    await userRepo.save(admin);
    const now = new Date('2026-06-10T12:00:00.000Z');
    await repo.record({ eventType: AUTH_ATTEMPT_FAILED_SIGN_IN, identifier: 'a@x.com', ipAddress: '1.1.1.1', userAgent: null, windowStart: now, now });

    const result = await useCase.execute(admin.id, {}, { page: 0, limit: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.page).toBe(1);
      expect(result.value.items).toHaveLength(1);
    }
  });
});
