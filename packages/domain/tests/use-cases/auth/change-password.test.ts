import { ChangePasswordUseCase } from '../../../src/use-cases/auth/change-password';
import { UserRepository } from '../../../src/ports/user/user.repository';
import { User } from '../../../src/entities/user';
import { UserId } from '../../../src/value-objects/user-id';
import { Email } from '../../../src/value-objects/email';
import { Timestamps } from '../../../src/value-objects/timestamps';
import { PasswordPolicy } from '../../../src/value-objects/password-policy';
import { PasswordHasher } from '../../../src/services/password-hasher';
import { BreachChecker } from '../../../src/services/breach-checker';

function createTestUser(passwordHash: string = 'current-hash'): User {
  return new User(
    UserId.create('550e8400-e29b-41d4-a716-446655440000'),
    Email.create('test@example.com'),
    'Test User',
    passwordHash,
    [],
    null,
    null,
    new Timestamps(),
  );
}

describe('ChangePasswordUseCase', () => {
  let useCase: ChangePasswordUseCase;
  let userRepo: UserRepository;
  let passwordHasher: PasswordHasher;
  let breachChecker: BreachChecker;

  const defaultPolicy: PasswordPolicy = {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireDigits: true,
    requireSymbols: false,
  };

  beforeEach(() => {
    const testUser = createTestUser();

    userRepo = {
      findByEmail: jest.fn().mockResolvedValue(testUser),
      save: jest.fn().mockImplementation(async (user: User) => user),
      findById: jest.fn().mockResolvedValue(testUser),
    } as unknown as UserRepository;

    passwordHasher = {
      hash: jest.fn().mockResolvedValue('new-hashed-password'),
      verify: jest.fn().mockResolvedValue(true),
    } as unknown as PasswordHasher;

    breachChecker = {
      isBreached: jest.fn().mockResolvedValue(false),
    } as unknown as BreachChecker;

    useCase = new ChangePasswordUseCase(
      userRepo,
      passwordHasher,
      defaultPolicy,
      breachChecker,
    );
  });

  describe('password change', () => {
    test('allows password change with valid inputs', async () => {
      const result = await useCase.execute(
        UserId.create('550e8400-e29b-41d4-a716-446655440000'),
        'CurrentP@ssw0rd1',
        'NewSecureP@ssw0rd1',
        5,
      );

      expect(result.success).toBe(true);
      expect(passwordHasher.hash).toHaveBeenCalledWith('NewSecureP@ssw0rd1');
      expect(userRepo.save).toHaveBeenCalled();
    });

    test('rejects password change with weak password', async () => {
      const result = await useCase.execute(
        UserId.create('550e8400-e29b-41d4-a716-446655440000'),
        'CurrentP@ssw0rd1',
        'weak',
        5,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.name).toBe('ValidationError');
      }
    });

    test('rejects password change when new password is breached', async () => {
      (breachChecker.isBreached as jest.Mock).mockResolvedValue(true);

      const result = await useCase.execute(
        UserId.create('550e8400-e29b-41d4-a716-446655440000'),
        'CurrentP@ssw0rd1',
        'BreachedP@ssw0rd1',
        5,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('breach');
      }
      expect(passwordHasher.hash).not.toHaveBeenCalled();
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    test('allows password change when new password is not breached', async () => {
      (breachChecker.isBreached as jest.Mock).mockResolvedValue(false);

      const result = await useCase.execute(
        UserId.create('550e8400-e29b-41d4-a716-446655440000'),
        'CurrentP@ssw0rd1',
        'NewSecureP@ssw0rd1',
        5,
      );

      expect(result.success).toBe(true);
      expect(passwordHasher.hash).toHaveBeenCalledWith('NewSecureP@ssw0rd1');
      expect(userRepo.save).toHaveBeenCalled();
    });
  });

  describe('authentication guards', () => {
    test('returns InvalidPasswordError when user is not found', async () => {
      (userRepo.findById as jest.Mock).mockResolvedValue(null);

      const result = await useCase.execute(
        UserId.create('550e8400-e29b-41d4-a716-446655440000'),
        'CurrentP@ssw0rd1',
        'NewSecureP@ssw0rd1',
        5,
      );

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.name).toBe('InvalidPasswordError');
    });

    test('returns InvalidPasswordError when current password is wrong', async () => {
      (passwordHasher.verify as jest.Mock).mockResolvedValue(false);

      const result = await useCase.execute(
        UserId.create('550e8400-e29b-41d4-a716-446655440000'),
        'WrongPassword1',
        'NewSecureP@ssw0rd1',
        5,
      );

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.name).toBe('InvalidPasswordError');
    });

    test('returns PasswordReuseError when new password matches a recent password', async () => {
      // Simulate a user with one entry in password history
      const userWithHistory = new User(
        UserId.create('550e8400-e29b-41d4-a716-446655440000'),
        Email.create('test@example.com'),
        'Test User',
        'current-hash',
        ['old-hash-1'],
        null,
        null,
        new Timestamps(),
      );
      (userRepo.findById as jest.Mock).mockResolvedValue(userWithHistory);
      // Current password verifies OK, but new password matches a history hash
      (passwordHasher.verify as jest.Mock)
        .mockResolvedValueOnce(true)  // current password is correct
        .mockResolvedValueOnce(true); // new password matches 'old-hash-1'

      const result = await useCase.execute(
        UserId.create('550e8400-e29b-41d4-a716-446655440000'),
        'CurrentP@ssw0rd1',
        'OldP@ssw0rd1',
        5,
      );

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.name).toBe('PasswordReuseError');
    });
  });

  describe('breach checker failure resilience', () => {
    test('allows password change when breach checker throws', async () => {
      (breachChecker.isBreached as jest.Mock).mockRejectedValue(new Error('HIBP API unavailable'));

      const result = await useCase.execute(
        UserId.create('550e8400-e29b-41d4-a716-446655440000'),
        'CurrentP@ssw0rd1',
        'NewSecureP@ssw0rd1',
        5,
      );

      expect(result.success).toBe(true);
      expect(userRepo.save).toHaveBeenCalled();
    });

    test('allows password change when breach checker times out', async () => {
      (breachChecker.isBreached as jest.Mock).mockRejectedValue(new Error('Request timeout'));

      const result = await useCase.execute(
        UserId.create('550e8400-e29b-41d4-a716-446655440000'),
        'CurrentP@ssw0rd1',
        'NewSecureP@ssw0rd1',
        5,
      );

      expect(result.success).toBe(true);
      expect(userRepo.save).toHaveBeenCalled();
    });
  });
});
