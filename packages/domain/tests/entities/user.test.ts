import { User } from '../../src/entities/user';
import { UserId } from '../../src/value-objects/ids/user-id';
import { Email } from '../../src/value-objects/identity/email';
import { Timestamps } from '../../src/value-objects/common/timestamps';

describe('User entity', () => {
  const userId = UserId.create('550e8400-e29b-41d4-a716-446655440000');
  const email = Email.create('user@example.com');

  test('creates with password hash', () => {
    const user = new User(userId, email, 'Test User', 'hashed_password', [], null, null);
    expect(user.id).toBe(userId);
    expect(user.email).toBe(email);
    expect(user.displayName).toBe('Test User');
    expect(user.passwordHash).toBe('hashed_password');
    expect(user.samlSubject).toBeNull();
    expect(user.mfaSecret).toBeNull();
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  test('creates with SAML subject', () => {
    const user = new User(userId, email, 'Test User', null, [], 'saml|idp|user123', null);
    expect(user.passwordHash).toBeNull();
    expect(user.samlSubject).toBe('saml|idp|user123');
  });

  test('rejects when both passwordHash and samlSubject are null', () => {
    expect(() => new User(userId, email, 'Test User', null, [], null, null)).toThrow();
  });

  test('rejects when createdAt > updatedAt', () => {
    const future = new Date('2025-01-02');
    const past = new Date('2025-01-01');
    expect(() => new User(userId, email, 'Test User', 'hash', [], null, null, false, new Timestamps(future, past))).toThrow();
  });

  test('exposes avatarKey field (null by default)', () => {
    const user = new User(userId, email, 'Test User', 'hashed_password', [], null, null);
    expect(user.avatarKey).toBeNull();
  });

  test('exposes avatarKey when provided', () => {
    const user = new User(userId, email, 'Test User', 'hashed_password', [], null, null, false, new Timestamps(), false, 'SELF_REGISTERED', 'initial-face', 'system');
    expect(user.avatarKey).toBe('initial-face');
  });

  test('exposes appTheme field ("system" by default)', () => {
    const user = new User(userId, email, 'Test User', 'hashed_password', [], null, null);
    expect(user.appTheme).toBe('system');
  });

  test('exposes appTheme when provided', () => {
    const user = new User(userId, email, 'Test User', 'hashed_password', [], null, null, false, new Timestamps(), false, 'SELF_REGISTERED', null, 'dark');
    expect(user.appTheme).toBe('dark');
  });
});
