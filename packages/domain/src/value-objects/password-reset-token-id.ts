import { Uuid } from './uuid';

/**
 * Strongly-typed identifier for PasswordResetToken entities.
 */
export class PasswordResetTokenId extends Uuid {
  /**
   * Creates a new PasswordResetTokenId from a UUID string.
   *
   * @param value - The UUID string.
   * @returns A new PasswordResetTokenId instance.
   * @throws {ValidationError} If the value is not a valid UUID.
   */
  static create(value: string): PasswordResetTokenId {
    return new PasswordResetTokenId(value);
  }
}
