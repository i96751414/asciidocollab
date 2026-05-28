import type { PasswordPolicy } from '@asciidocollab/domain';
import { getConfig } from '../config';

/**
 * Builds a PasswordPolicy from the application configuration.
 *
 * @returns The password policy derived from config.
 */
export function buildPasswordPolicy(): PasswordPolicy {
  const config = getConfig();
  return {
    minLength: config.auth.password.minLength,
    requireUppercase: config.auth.password.requireUppercase,
    requireLowercase: config.auth.password.requireLowercase,
    requireDigits: config.auth.password.requireDigits,
    requireSymbols: config.auth.password.requireSymbols,
  };
}
