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
 * Validates a password against the given policy.
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
