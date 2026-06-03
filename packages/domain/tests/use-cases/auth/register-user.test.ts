import { RegisterUseCase } from '../../../src/use-cases/auth/register-user';
import { InMemoryUserRepository } from '../../ports/user/in-memory-user.repository';
import { InMemorySystemSettingRepository } from '../../ports/admin/in-memory-system-setting.repository';
import { InMemoryEmailVerificationTokenRepository } from '../../ports/auth-tokens/in-memory-email-verification-token.repository';
import { Email } from '../../../src/value-objects/email';
import { PasswordPolicy } from '../../../src/value-objects/password-policy';
import { PasswordHasher } from '../../../src/services/password-hasher';
import { BreachChecker } from '../../../src/services/breach-checker';
import { CommonPasswordChecker } from '../../../src/services/common-password-checker';
import type { TokenGenerator, PasswordResetTokenData } from '../../../src/services/token-generator';
import type { EmailVerificationNotifier } from '../../../src/services/email-verification-notifier';
import { RegistrationClosedError } from '../../../src/errors/registration-closed';
import { User } from '../../../src/entities/user';
import { UserId } from '../../../src/value-objects/user-id';
import { Timestamps } from '../../../src/value-objects/timestamps';
import { randomUUID } from 'crypto';

const tokenData: PasswordResetTokenData = {
  token: 'raw-token',
  hashedToken: 'hashed-token',
  expiresAt: new Date(Date.now() + 86_400_000),
};
const tokenGenerator: TokenGenerator = {
  generatePasswordResetToken: () => tokenData,
  generateInvitationToken: () => tokenData,
  generateEmailVerificationToken: () => tokenData,
  hashToken: (t) => `hashed:${t}`,
};
const emailVerificationNotifier: EmailVerificationNotifier = {
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendResendVerificationEmail: jest.fn().mockResolvedValue(undefined),
};

describe('RegisterUserUseCase', () => {
  let useCase: RegisterUseCase;
  let userRepo: InMemoryUserRepository;
  let systemSettingRepo: InMemorySystemSettingRepository;
  let emailVerificationTokenRepo: InMemoryEmailVerificationTokenRepository;
  let passwordHasher: PasswordHasher;
  let breachChecker: BreachChecker;
  let commonPasswordChecker: CommonPasswordChecker;

  const defaultPolicy: PasswordPolicy = {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireDigits: true,
    requireSymbols: false,
  };

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    systemSettingRepo = new InMemorySystemSettingRepository();
    emailVerificationTokenRepo = new InMemoryEmailVerificationTokenRepository();

    passwordHasher = {
      hash: jest.fn().mockResolvedValue('hashed-password'),
      verify: jest.fn().mockResolvedValue(true),
    } as unknown as PasswordHasher;

    breachChecker = {
      isBreached: jest.fn().mockResolvedValue(false),
    } as unknown as BreachChecker;

    commonPasswordChecker = {
      isCommon: jest.fn().mockReturnValue(false),
    } as unknown as CommonPasswordChecker;

    jest.clearAllMocks();
    (emailVerificationNotifier.sendVerificationEmail as jest.Mock).mockResolvedValue(undefined);
    (emailVerificationNotifier.sendResendVerificationEmail as jest.Mock).mockResolvedValue(undefined);

    useCase = new RegisterUseCase(
      userRepo,
      systemSettingRepo,
      emailVerificationTokenRepo,
      defaultPolicy,
      commonPasswordChecker,
      breachChecker,
      passwordHasher,
      tokenGenerator,
      emailVerificationNotifier,
    );
  });

  describe('registration closed (FR-008)', () => {
    test('returns RegistrationClosedError when open registration is disabled and users exist', async () => {
      const existingUser = new User(
        UserId.create(randomUUID()),
        Email.create('existing@example.com'),
        'Existing User',
        'hash',
        [],
        null,
        null,
        true,
        new Timestamps(),
        true,
        'SELF_REGISTERED',
      );
      await userRepo.save(existingUser);
      // openRegistration is not set → defaults to false

      const result = await useCase.execute(
        Email.create('new@example.com'),
        'New User',
        'SecureP@ssw0rd123!',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(RegistrationClosedError);
      }
    });

    test('returns RegistrationClosedError when concurrent insert causes constraint violation', async () => {
      const userRepoWithSaveThrow = new InMemoryUserRepository();
      jest.spyOn(userRepoWithSaveThrow, 'save').mockRejectedValue(
        Object.assign(new Error('unique constraint'), { code: '23505' }),
      );
      jest.spyOn(userRepoWithSaveThrow, 'hasAny')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const uc = new RegisterUseCase(
        userRepoWithSaveThrow,
        systemSettingRepo,
        emailVerificationTokenRepo,
        defaultPolicy,
        commonPasswordChecker,
        breachChecker,
        passwordHasher,
        tokenGenerator,
        emailVerificationNotifier,
      );

      const result = await uc.execute(
        Email.create('race@example.com'),
        'Race User',
        'SecureP@ssw0rd123!',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(RegistrationClosedError);
      }
    });

    test('propagates the original save error when hasAny() also fails in the catch block', async () => {
      const userRepoMock = new InMemoryUserRepository();
      const saveError = new Error('DB connection timeout');
      jest.spyOn(userRepoMock, 'hasAny')
        .mockResolvedValueOnce(false)
        .mockRejectedValueOnce(new Error('DB still unreachable'));
      jest.spyOn(userRepoMock, 'save').mockRejectedValue(saveError);

      const uc = new RegisterUseCase(
        userRepoMock,
        systemSettingRepo,
        emailVerificationTokenRepo,
        defaultPolicy,
        commonPasswordChecker,
        breachChecker,
        passwordHasher,
        tokenGenerator,
        emailVerificationNotifier,
      );

      await expect(
        uc.execute(Email.create('user@example.com'), 'User', 'SecureP@ssw0rd123!'),
      ).rejects.toThrow('DB connection timeout');
    });
  });

  describe('breach blocking (FR-008)', () => {
    test('rejects registration when password is breached', async () => {
      (breachChecker.isBreached as jest.Mock).mockResolvedValue(true);

      const result = await useCase.execute(
        Email.create('test@example.com'),
        'Test User',
        'BreachedP@ssw0rd123!',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('breach');
      }
    });

    test('allows registration when password is not breached (first user)', async () => {
      (breachChecker.isBreached as jest.Mock).mockResolvedValue(false);

      const result = await useCase.execute(
        Email.create('test@example.com'),
        'Test User',
        'SecureP@ssw0rd123!',
      );

      expect(result.success).toBe(true);
    });

    test('breach check runs during registration', async () => {
      (breachChecker.isBreached as jest.Mock).mockResolvedValue(true);

      const result = await useCase.execute(
        Email.create('test@example.com'),
        'Test User',
        'BreachedP@ssw0rd123!',
      );

      expect(result.success).toBe(false);
      expect(breachChecker.isBreached).toHaveBeenCalledWith('BreachedP@ssw0rd123!');
    });
  });

  describe('result interface', () => {
    test('result contains userId for first user', async () => {
      (breachChecker.isBreached as jest.Mock).mockResolvedValue(false);

      const result = await useCase.execute(
        Email.create('test@example.com'),
        'Test User',
        'SecureP@ssw0rd123!',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveProperty('userId');
        expect(result.value.isFirstUser).toBe(true);
      }
    });
  });

  describe('breach checker failure resilience', () => {
    test('allows registration when breach checker throws', async () => {
      (breachChecker.isBreached as jest.Mock).mockRejectedValue(new Error('HIBP API unavailable'));

      const result = await useCase.execute(
        Email.create('test@example.com'),
        'Test User',
        'SecureP@ssw0rd123!',
      );

      expect(result.success).toBe(true);
    });

    test('allows registration when breach checker times out', async () => {
      (breachChecker.isBreached as jest.Mock).mockRejectedValue(new Error('Request timeout'));

      const result = await useCase.execute(
        Email.create('test@example.com'),
        'Test User',
        'SecureP@ssw0rd123!',
      );

      expect(result.success).toBe(true);
    });
  });

  describe('self-registration (open registration enabled)', () => {
    beforeEach(async () => {
      // Add an existing user to trigger the "not first user" path
      const existingUser = new User(
        UserId.create(randomUUID()),
        Email.create('admin@example.com'),
        'Admin',
        'hash',
        [],
        null,
        null,
        true,
        new Timestamps(),
        true,
        'SELF_REGISTERED',
      );
      await userRepo.save(existingUser);
      await systemSettingRepo.set('openRegistration', 'true');
    });

    test('creates unverified user and sends verification email', async () => {
      const result = await useCase.execute(
        Email.create('newuser@example.com'),
        'New User',
        'SecureP@ssw0rd123!',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isFirstUser).toBe(false);
      }
      const user = await userRepo.findByEmail(Email.create('newuser@example.com'));
      expect(user?.emailVerified).toBe(false);
      expect(emailVerificationNotifier.sendVerificationEmail).toHaveBeenCalled();
    });

    test('returns success for already-registered email (anti-enumeration)', async () => {
      const existingEmail = Email.create('already@example.com');
      const existing = new User(
        UserId.create(randomUUID()),
        existingEmail,
        'Already',
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

      const result = await useCase.execute(existingEmail, 'Name', 'SecureP@ssw0rd123!');
      expect(result.success).toBe(true);
      expect(emailVerificationNotifier.sendVerificationEmail).not.toHaveBeenCalled();
    });

    // ── Bug #4 test (must fail before fix) ────────────────────────────────────
    // Anti-enumeration path must not tell the frontend a verification email was
    // dispatched when none actually was — that would show "Check your email" for
    // a message that will never arrive.
    test('anti-enumeration path sets emailSent:false so the route omits requiresEmailVerification', async () => {
      const existingEmail = Email.create('admin@example.com'); // already in repo from beforeEach

      const result = await useCase.execute(existingEmail, 'Dup', 'SecureP@ssw0rd123!');

      expect(result.success).toBe(true);
      if (result.success) {
        // emailSent must be false — no verification email was dispatched
        expect(result.value.emailSent).toBe(false);
      }
      expect(emailVerificationNotifier.sendVerificationEmail).not.toHaveBeenCalled();
    });

    // ── Bug #2 test (must fail before fix) ────────────────────────────────────
    // When userRepo.save throws AFTER sendVerificationEmail, the user receives
    // an orphaned link pointing to a token that was never persisted.
    // The correct behaviour: save user+token FIRST, only then dispatch the email.
    test('email is not dispatched when user persistence fails', async () => {
      // Make every subsequent save (i.e. the new user) throw
      jest.spyOn(userRepo, 'save').mockRejectedValue(new Error('DB constraint'));

      await expect(
        useCase.execute(Email.create('new@example.com'), 'New', 'SecureP@ssw0rd123!'),
      ).rejects.toThrow('DB constraint');

      // After the fix (save-first order), email must NOT have been sent when save failed.
      expect(emailVerificationNotifier.sendVerificationEmail).not.toHaveBeenCalled();
    });

    // ── Bug #2 supplementary: new self-reg user reflects emailSent:true ───────
    test('successful self-registration returns emailSent:true', async () => {
      const result = await useCase.execute(
        Email.create('newuser2@example.com'),
        'New User 2',
        'SecureP@ssw0rd123!',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.emailSent).toBe(true);
      }
    });
  });
});
