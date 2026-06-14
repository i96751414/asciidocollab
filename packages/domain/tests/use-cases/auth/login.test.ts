import { LoginUseCase } from '../../../src/use-cases/auth/login';
import { InMemoryUserRepository } from '../../ports/user/in-memory-user.repository';
import { InMemoryAuditLogRepository } from '../../ports/admin/in-memory-audit-log.repository';
import { InMemoryAuthAttemptTelemetryRepository } from '../../ports/admin/in-memory-auth-attempt-telemetry.repository';
import { User } from '../../../src/entities/user';
import { UserId } from '../../../src/value-objects/ids/user-id';
import { Email } from '../../../src/value-objects/identity/email';
import { Timestamps } from '../../../src/value-objects/common/timestamps';
import { PasswordHasher } from '../../../src/services/password-hasher';
import { RequestContext } from '../../../src/types/request-context';
import { randomUUID } from 'crypto';

const TEST_EMAIL = 'user@example.com';
const TEST_HASH = 'hashed-password';
const CONTEXT: RequestContext = { ipAddress: '203.0.113.7', userAgent: 'jest' };
const WINDOW_MS = 60 * 60 * 1000;

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
  let auditRepo: InMemoryAuditLogRepository;
  let failedRepo: InMemoryAuthAttemptTelemetryRepository;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    auditRepo = new InMemoryAuditLogRepository();
    failedRepo = new InMemoryAuthAttemptTelemetryRepository();
  });

  function makeUseCase(valid: boolean): LoginUseCase {
    return new LoginUseCase(userRepo, makePasswordHasher(valid), auditRepo, failedRepo);
  }

  test('returns error for unknown email and records failed-sign-in telemetry', async () => {
    const result = await makeUseCase(false).execute(Email.create(TEST_EMAIL), 'wrong', CONTEXT, WINDOW_MS);
    expect(result.success).toBe(false);
    const attempts = await failedRepo.findAll();
    expect(attempts).toHaveLength(1);
    expect(attempts[0].identifier).toBe(TEST_EMAIL);
    expect(await auditRepo.findAll()).toHaveLength(0);
  });

  test('returns error for wrong password and records failed-sign-in telemetry', async () => {
    await userRepo.save(makeUser());
    const result = await makeUseCase(false).execute(Email.create(TEST_EMAIL), 'wrong', CONTEXT, WINDOW_MS);
    expect(result.success).toBe(false);
    expect(await failedRepo.findAll()).toHaveLength(1);
  });

  test('records an identical-shape failure whether or not the account exists (neutrality)', async () => {
    await makeUseCase(false).execute(Email.create('ghost@example.com'), 'wrong', CONTEXT, WINDOW_MS);
    await userRepo.save(makeUser());
    await makeUseCase(false).execute(Email.create(TEST_EMAIL), 'wrong', CONTEXT, WINDOW_MS);
    const all = await failedRepo.findAll();
    expect(all).toHaveLength(2);
    expect(Object.keys({ ...all[0] })).toEqual(Object.keys({ ...all[1] }));
  });

  test('returns userId/emailVerified/isAdmin and records auth.signed_in on success', async () => {
    const user = makeUser({ isAdmin: true, emailVerified: false });
    await userRepo.save(user);
    const result = await makeUseCase(true).execute(Email.create(TEST_EMAIL), 'correct', CONTEXT, WINDOW_MS);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.userId).toBe(user.id.value);
      expect(result.value.isAdmin).toBe(true);
      expect(result.value.emailVerified).toBe(false);
    }
    const audits = await auditRepo.findAll();
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('auth.signed_in');
    expect(audits[0].metadata.origin).toEqual({ ipAddress: '203.0.113.7', userAgent: 'jest' });
    expect(await failedRepo.findAll()).toHaveLength(0);
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
    const result = await makeUseCase(true).execute(Email.create(TEST_EMAIL), 'any', CONTEXT, WINDOW_MS);
    expect(result.success).toBe(false);
    expect(await failedRepo.findAll()).toHaveLength(1);
  });
});
