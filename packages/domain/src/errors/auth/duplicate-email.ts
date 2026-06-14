import { DomainError } from '../domain-error';

/**
 * Thrown when attempting to register a user with an email that is already in use.
 */
export class DuplicateEmailError extends DomainError {
  readonly name = 'DuplicateEmailError';

  /**
   * @param email - The duplicate email address.
   */
  constructor(email: string) {
    super(`A user with this email already exists: ${email}`);
  }
}
