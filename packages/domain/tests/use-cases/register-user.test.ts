import { RegisterUserUseCase } from '../../src/use-cases/register-user';
import { UserRepository } from '../../src/repositories/user.repository';
import { User } from '../../src/entities/user';
import { Email } from '../../src/value-objects/email';
import { PasswordPolicy } from '../../src/value-objects/password-policy';
import { PasswordHasher } from '../../src/services/password-hasher';
import { BreachChecker } from '../../src/services/breach-checker';
import { CommonPasswordChecker } from '../../src/services/common-password-checker';
import { RegistrationClosedError } from '../../src/errors/registration-closed';

describe('RegisterUserUseCase', () => {
  let useCase: RegisterUserUseCase;
  let userRepo: UserRepository;
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
    const users = new Map<string, User>();

    userRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation(async (user: User) => {
        users.set(user.id.value, user);
        return user;
      }),
      findById: jest.fn().mockResolvedValue(null),
      hasAny: jest.fn().mockResolvedValue(false),
    } as unknown as UserRepository;

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

    useCase = new RegisterUserUseCase(
      userRepo,
      defaultPolicy,
      commonPasswordChecker,
      breachChecker,
      passwordHasher,
    );
  });

  describe('registration closed (FR-008)', () => {
    test('returns RegistrationClosedError when users already exist', async () => {
      (userRepo.hasAny as jest.Mock).mockResolvedValue(true);

      const result = await useCase.execute(
        Email.create('new@example.com'),
        'New User',
        'SecureP@ssw0rd123!',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(RegistrationClosedError);
      }
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    test('returns RegistrationClosedError when concurrent insert causes constraint violation', async () => {
      (userRepo.hasAny as jest.Mock)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      (userRepo.save as jest.Mock).mockRejectedValue(
        Object.assign(new Error('unique constraint'), { code: '23505' }),
      );

      const result = await useCase.execute(
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
      const saveError = new Error('DB connection timeout');
      const hasAnyError = new Error('DB still unreachable');
      (userRepo.hasAny as jest.Mock)
        .mockResolvedValueOnce(false)
        .mockRejectedValueOnce(hasAnyError);
      (userRepo.save as jest.Mock).mockRejectedValue(saveError);

      await expect(
        useCase.execute(Email.create('user@example.com'), 'User', 'SecureP@ssw0rd123!'),
      ).rejects.toThrow('DB connection timeout');
    });

    test('rethrows save error when no concurrent user was inserted', async () => {
      const saveError = new Error('unexpected DB error');
      (userRepo.hasAny as jest.Mock)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);
      (userRepo.save as jest.Mock).mockRejectedValue(saveError);

      await expect(
        useCase.execute(Email.create('user@example.com'), 'User', 'SecureP@ssw0rd123!'),
      ).rejects.toThrow('unexpected DB error');
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
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    test('allows registration when password is not breached', async () => {
      (breachChecker.isBreached as jest.Mock).mockResolvedValue(false);

      const result = await useCase.execute(
        Email.create('test@example.com'),
        'Test User',
        'SecureP@ssw0rd123!',
      );

      expect(result.success).toBe(true);
      expect(userRepo.save).toHaveBeenCalled();
    });

    test('breach check runs even when email is disabled', async () => {
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
    test('result does not contain breached field', async () => {
      (breachChecker.isBreached as jest.Mock).mockResolvedValue(false);

      const result = await useCase.execute(
        Email.create('test@example.com'),
        'Test User',
        'SecureP@ssw0rd123!',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).not.toHaveProperty('breached');
        expect(result.value).toHaveProperty('userId');
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
      expect(userRepo.save).toHaveBeenCalled();
    });

    test('allows registration when breach checker times out', async () => {
      (breachChecker.isBreached as jest.Mock).mockRejectedValue(new Error('Request timeout'));

      const result = await useCase.execute(
        Email.create('test@example.com'),
        'Test User',
        'SecureP@ssw0rd123!',
      );

      expect(result.success).toBe(true);
      expect(userRepo.save).toHaveBeenCalled();
    });
  });
});
