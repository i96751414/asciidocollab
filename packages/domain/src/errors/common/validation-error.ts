import { DomainError } from '../domain-error';

/**
 * Error thrown when a domain value-object validation fails.
 * Used as control flow for invalid input to value object constructors and creators.
 */
export class ValidationError extends DomainError {
  readonly name = 'ValidationError';
}
