// T001: Failing tests for buildPasswordSchema — all policy rule combinations
import { buildPasswordSchema } from '@/lib/password-schema';
import type { PasswordPolicyDto } from '@asciidocollab/shared';

const minimalPolicy: PasswordPolicyDto = {
  minLength: 8,
  requireUppercase: false,
  requireLowercase: false,
  requireDigits: false,
  requireSymbols: false,
};

describe('buildPasswordSchema', () => {
  test('accepts a password meeting minimum length', () => {
    const schema = buildPasswordSchema(minimalPolicy);
    expect(schema.safeParse('12345678').success).toBe(true);
  });

  test('rejects a password shorter than minimum length', () => {
    const schema = buildPasswordSchema(minimalPolicy);
    const result = schema.safeParse('abc');
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0].message).toContain('8');
  });

  test('enforces requireUppercase', () => {
    const policy = { ...minimalPolicy, requireUppercase: true };
    const schema = buildPasswordSchema(policy);
    expect(schema.safeParse('alllowercase1').success).toBe(false);
    expect(schema.safeParse('HasUpper1').success).toBe(true);
  });

  test('enforces requireLowercase', () => {
    const policy = { ...minimalPolicy, requireLowercase: true };
    const schema = buildPasswordSchema(policy);
    expect(schema.safeParse('ALLUPPERCASE1').success).toBe(false);
    expect(schema.safeParse('HASupper1').success).toBe(true);
  });

  test('enforces requireDigits', () => {
    const policy = { ...minimalPolicy, requireDigits: true };
    const schema = buildPasswordSchema(policy);
    expect(schema.safeParse('NoDigitsHere').success).toBe(false);
    expect(schema.safeParse('HasDigit1').success).toBe(true);
  });

  test('enforces requireSymbols', () => {
    const policy = { ...minimalPolicy, requireSymbols: true };
    const schema = buildPasswordSchema(policy);
    expect(schema.safeParse('NoSymbolsHere1').success).toBe(false);
    expect(schema.safeParse('HasSymbol@1').success).toBe(true);
  });

  test('enforces all rules simultaneously', () => {
    const policy: PasswordPolicyDto = {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireDigits: true,
      requireSymbols: true,
    };
    const schema = buildPasswordSchema(policy);
    expect(schema.safeParse('short').success).toBe(false);
    expect(schema.safeParse('alllowercase1!').success).toBe(false);
    expect(schema.safeParse('ALLUPPERCASE1!').success).toBe(false);
    expect(schema.safeParse('NoDigitsHere!!').success).toBe(false);
    expect(schema.safeParse('NoSymbol123abcA').success).toBe(false);
    expect(schema.safeParse('ValidP@ssw0rdX!').success).toBe(true);
  });

  test('minLength 1 accepts single character', () => {
    const policy = { ...minimalPolicy, minLength: 1 };
    const schema = buildPasswordSchema(policy);
    expect(schema.safeParse('x').success).toBe(true);
  });
});
