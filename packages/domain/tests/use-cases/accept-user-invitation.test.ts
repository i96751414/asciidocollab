import { AcceptUserInvitationUseCase } from '../../src/use-cases/accept-user-invitation';
import { InMemoryUserRepository } from '../ports/user/in-memory-user.repository';
import { InMemoryUserInvitationRepository } from '../ports/user/in-memory-user-invitation.repository';
import { InMemoryAuditLogRepository } from '../ports/admin/in-memory-audit-log.repository';
import { UserInvitation } from '../../src/entities/user-invitation';
import { UserInvitationId } from '../../src/value-objects/user-invitation-id';
import { Email } from '../../src/value-objects/email';
import { UserId } from '../../src/value-objects/user-id';
import { InvalidTokenError } from '../../src/errors/invalid-token';
import { DuplicateEmailError } from '../../src/errors/duplicate-email';
import { ValidationError } from '../../src/errors/validation-error';
import type { PasswordHasher } from '../../src/services/password-hasher';
import type { PasswordPolicy } from '../../src/value-objects/password-policy';
import type { BreachChecker } from '../../src/services/breach-checker';
import type { CommonPasswordChecker } from '../../src/services/common-password-checker';
import type { TokenGenerator, PasswordResetTokenData } from '../../src/services/token-generator';
import { randomUUID } from 'crypto';
import { User } from '../../src/entities/user';
import { Timestamps } from '../../src/value-objects/timestamps';

const RAW_TOKEN = 'my-raw-token';
const HASHED_TOKEN = 'hashed:my-raw-token';

const tokenGenerator: TokenGenerator = {
  generatePasswordResetToken: () => ({ token: RAW_TOKEN, hashedToken: HASHED_TOKEN, expiresAt: new Date() } as PasswordResetTokenData),
  generateInvitationToken: () => ({ token: RAW_TOKEN, hashedToken: HASHED_TOKEN, expiresAt: new Date() } as PasswordResetTokenData),
  generateEmailVerificationToken: () => ({ token: RAW_TOKEN, hashedToken: HASHED_TOKEN, expiresAt: new Date() } as PasswordResetTokenData),
  hashToken: (t) => `hashed:${t}`,
};

const validPassword = 'SecureP@ssword1!';
const policy: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireDigits: true,
  requireSymbols: false,
};
const passwordHasher: PasswordHasher = {
  hash: jest.fn().mockResolvedValue('hashed'),
  verify: jest.fn().mockResolvedValue(true),
};
const breachChecker: BreachChecker = {
  isBreached: jest.fn().mockResolvedValue(false),
};
const commonPasswordChecker: CommonPasswordChecker = {
  isCommon: jest.fn().mockReturnValue(false),
};

function makeValidInvitation(email = 'invited@example.com') {
  return new UserInvitation(
    UserInvitationId.create(randomUUID()),
    Email.create(email),
    null,
    HASHED_TOKEN,
    new Date(Date.now() + 86_400_000),
    null,
    new Date(),
  );
}

describe('AcceptUserInvitationUseCase', () => {
  let userRepo: InMemoryUserRepository;
  let invitationRepo: InMemoryUserInvitationRepository;
  let auditLogRepo: InMemoryAuditLogRepository;
  let useCase: AcceptUserInvitationUseCase;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    invitationRepo = new InMemoryUserInvitationRepository();
    auditLogRepo = new InMemoryAuditLogRepository();
    useCase = new AcceptUserInvitationUseCase(
      userRepo,
      invitationRepo,
      auditLogRepo,
      tokenGenerator,
      passwordHasher,
      policy,
      commonPasswordChecker,
      breachChecker,
    );
    jest.clearAllMocks();
    (breachChecker.isBreached as jest.Mock).mockResolvedValue(false);
    (commonPasswordChecker.isCommon as jest.Mock).mockReturnValue(false);
    (passwordHasher.hash as jest.Mock).mockResolvedValue('hashed');
  });

  test('returns InvalidTokenError when token not found', async () => {
    const result = await useCase.execute('unknown-raw-token', 'Display Name', validPassword);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(InvalidTokenError);
  });

  test('returns InvalidTokenError when invitation is expired', async () => {
    const expired = new UserInvitation(
      UserInvitationId.create(randomUUID()),
      Email.create('exp@example.com'),
      null,
      HASHED_TOKEN,
      new Date(Date.now() - 1000),
      null,
      new Date(),
    );
    await invitationRepo.save(expired);

    const result = await useCase.execute(RAW_TOKEN, 'Name', validPassword);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(InvalidTokenError);
  });

  test('returns InvalidTokenError when invitation already accepted', async () => {
    const accepted = new UserInvitation(
      UserInvitationId.create(randomUUID()),
      Email.create('acc@example.com'),
      null,
      HASHED_TOKEN,
      new Date(Date.now() + 86_400_000),
      new Date(),
      new Date(),
    );
    await invitationRepo.save(accepted);

    const result = await useCase.execute(RAW_TOKEN, 'Name', validPassword);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(InvalidTokenError);
  });

  test('returns ValidationError when display name is empty', async () => {
    await invitationRepo.save(makeValidInvitation());

    const result = await useCase.execute(RAW_TOKEN, '', validPassword);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
  });

  test('returns DuplicateEmailError when email already registered (race)', async () => {
    await invitationRepo.save(makeValidInvitation('raceuser@example.com'));
    const existing = new User(
      UserId.create(randomUUID()),
      Email.create('raceuser@example.com'),
      'Existing',
      'hash',
      [],
      null,
      null,
      false,
      new Timestamps(),
      true,
      'SELF_REGISTERED',
    );
    await userRepo.save(existing);

    const result = await useCase.execute(RAW_TOKEN, 'New User', validPassword);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(DuplicateEmailError);
  });

  test('success: user created with emailVerified=true and registrationMethod=INVITED', async () => {
    await invitationRepo.save(makeValidInvitation('success@example.com'));

    const result = await useCase.execute(RAW_TOKEN, 'New User', validPassword);

    expect(result.success).toBe(true);
    if (result.success) {
      const user = await userRepo.findByEmail(Email.create('success@example.com'));
      expect(user?.emailVerified).toBe(true);
      expect(user?.registrationMethod).toBe('INVITED');

      const saved = await invitationRepo.findByTokenHash(HASHED_TOKEN);
      expect(saved?.acceptedAt).not.toBeNull();

      const logs = await auditLogRepo.findAll();
      expect(logs.some((l) => l.action === 'user.invitation_accepted')).toBe(true);
    }
  });
});
