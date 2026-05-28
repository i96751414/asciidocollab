import { getConfig } from '../config';

/**
 * Password policy configuration.
 */
export interface PasswordPolicy {
  /** Minimum password length. */
  minLength: number;
  /** Whether uppercase letters are required. */
  requireUppercase: boolean;
  /** Whether lowercase letters are required. */
  requireLowercase: boolean;
  /** Whether digits are required. */
  requireDigits: boolean;
  /** Whether symbols are required. */
  requireSymbols: boolean;
}

/**
 * Gets the password policy from configuration.
 *
 * @returns The password policy configuration.
 */
export function getPasswordPolicy(): PasswordPolicy {
  const config = getConfig();
  return {
    minLength: config.auth.password.minLength,
    requireUppercase: config.auth.password.requireUppercase,
    requireLowercase: config.auth.password.requireLowercase,
    requireDigits: config.auth.password.requireDigits,
    requireSymbols: config.auth.password.requireSymbols,
  };
}

/**
 * Validates a password against the policy.
 *
 * @param password - The password to validate.
 * @param policy - The password policy to validate against.
 * @returns An error message if validation fails, null otherwise.
 */
export function validatePassword(password: string, policy: PasswordPolicy): string | null {
  if (password.length < policy.minLength) {
    return `Password must be at least ${policy.minLength} characters long`;
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (policy.requireDigits && !/\d/.test(password)) {
    return 'Password must contain at least one digit';
  }
  if (policy.requireSymbols && !/[^A-Za-z0-9]/.test(password)) {
    return 'Password must contain at least one symbol';
  }
  return null;
}

/**
 * Validates an email address format.
 *
 * @param email - The email address to validate.
 * @returns An error message if validation fails, null otherwise.
 */
export function validateEmail(email: string): string | null {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return 'Invalid email format';
  }
  return null;
}
