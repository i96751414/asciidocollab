import { DomainError } from './domain-error';

/**
 * Error thrown when a password reset token is invalid or expired.
 */
export class InvalidTokenError extends DomainError {
  readonly name = 'InvalidTokenError';
}
