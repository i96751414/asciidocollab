import { DomainError } from './domain-error';

/**
 * Error thrown when a user attempts to reuse a recent password.
 */
export class PasswordReuseError extends DomainError {
  readonly name = 'PasswordReuseError';
}
