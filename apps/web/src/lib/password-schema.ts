import { z } from 'zod';
import type { PasswordPolicyDto } from '@asciidocollab/shared';

/** Builds a Zod string schema that enforces the given password policy. */
export function buildPasswordSchema(policy: PasswordPolicyDto): z.ZodString {
  let schema = z.string().min(
    policy.minLength,
    `Password must be at least ${policy.minLength} characters`,
  );
  if (policy.requireUppercase) {
    schema = schema.regex(/[A-Z]/, 'Password must contain at least one uppercase letter');
  }
  if (policy.requireLowercase) {
    schema = schema.regex(/[a-z]/, 'Password must contain at least one lowercase letter');
  }
  if (policy.requireDigits) {
    schema = schema.regex(/\d/, 'Password must contain at least one digit');
  }
  if (policy.requireSymbols) {
    schema = schema.regex(/[^A-Za-z0-9]/, 'Password must contain at least one symbol');
  }
  return schema;
}
