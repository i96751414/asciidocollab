import { DomainError } from '../domain-error';

/** Thrown when an anchor payload is missing its required passage or is otherwise unusable. */
export class AnchorInvalidError extends DomainError {
  readonly name = 'AnchorInvalidError';

  /**
   * @param message - A safe, human-readable description of why the anchor is invalid.
   */
  constructor(message = 'Anchor is invalid') {
    super(message);
  }
}
