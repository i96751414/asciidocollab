/**
 * Abstract base class for all domain-level errors.
 * Extends `Error` and ensures proper prototype chain inheritance.
 */
export abstract class DomainError extends Error {
  /** The concrete error name, set by each subclass. */
  abstract readonly name: string;

  /**
   * @param message - A human-readable description of the error.
   */
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
