import { DomainError } from '../domain-error';

/**
 * Error for a replacement template that references a capture group the pattern
 * does not define (FR-006d). Distinct from {@link ValidationError} so the route
 * can map it to `INVALID_REPLACEMENT` rather than `INVALID_PATTERN`.
 */
export class InvalidReplacementError extends DomainError {
  readonly name = 'InvalidReplacementError';
}
