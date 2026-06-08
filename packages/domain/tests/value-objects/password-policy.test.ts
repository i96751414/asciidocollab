import { validatePassword, PasswordPolicy } from '../../src/value-objects/password-policy';

const fullPolicy: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireDigits: true,
  requireSymbols: true,
};

describe('validatePassword', () => {
  it('returns null when the password satisfies all policy requirements', () => {
    expect(validatePassword('SecureP@ss1', fullPolicy)).toBeNull();
  });

  it('returns an error message when password is shorter than minLength', () => {
    const message = validatePassword('Ab1@', { ...fullPolicy, minLength: 10 });
    expect(message).toContain('characters');
  });

  it('returns an error message when uppercase is required but missing', () => {
    const message = validatePassword('lowercase1@', fullPolicy);
    expect(message).toContain('uppercase');
  });

  it('returns an error message when lowercase is required but missing', () => {
    const message = validatePassword('UPPERCASE1@', fullPolicy);
    expect(message).toContain('lowercase');
  });

  it('returns an error message when digits are required but missing', () => {
    const message = validatePassword('NoDigitsHere@', fullPolicy);
    expect(message).toContain('digit');
  });

  it('returns an error message when symbols are required but missing', () => {
    const message = validatePassword('NoSymbol1A', fullPolicy);
    expect(message).toContain('symbol');
  });

  it('skips symbol check when requireSymbols is false', () => {
    const policy: PasswordPolicy = { ...fullPolicy, requireSymbols: false };
    expect(validatePassword('NoSymbol1A', policy)).toBeNull();
  });
});
