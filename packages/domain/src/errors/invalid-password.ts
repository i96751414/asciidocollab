import { DomainError } from './domain-error';

/**
 * Error thrown when password verification fails.
 */
export class InvalidPasswordError extends DomainError {
  readonly name = 'InvalidPasswordError';
}
