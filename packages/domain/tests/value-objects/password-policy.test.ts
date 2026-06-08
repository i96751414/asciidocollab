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
    const msg = validatePassword('Ab1@', { ...fullPolicy, minLength: 10 });
    expect(msg).toContain('characters');
  });

  it('returns an error message when uppercase is required but missing', () => {
    const msg = validatePassword('lowercase1@', fullPolicy);
    expect(msg).toContain('uppercase');
  });

  it('returns an error message when lowercase is required but missing', () => {
    const msg = validatePassword('UPPERCASE1@', fullPolicy);
    expect(msg).toContain('lowercase');
  });

  it('returns an error message when digits are required but missing', () => {
    const msg = validatePassword('NoDigitsHere@', fullPolicy);
    expect(msg).toContain('digit');
  });

  it('returns an error message when symbols are required but missing', () => {
    const msg = validatePassword('NoSymbol1A', fullPolicy);
    expect(msg).toContain('symbol');
  });

  it('skips symbol check when requireSymbols is false', () => {
    const policy: PasswordPolicy = { ...fullPolicy, requireSymbols: false };
    expect(validatePassword('NoSymbol1A', policy)).toBeNull();
  });
});
