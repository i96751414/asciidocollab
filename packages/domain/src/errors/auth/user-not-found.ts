import { DomainError } from '../domain-error';

/**
 * Thrown when a user cannot be found by the given identifier (ID or email).
 */
export class UserNotFoundError extends DomainError {
  readonly name = 'UserNotFoundError';

  /**
   * @param userIdOrEmail - The user ID or email that was not found.
   */
  constructor(userIdOrEmail: string) {
    super(`User not found: ${userIdOrEmail}`);
  }
}
