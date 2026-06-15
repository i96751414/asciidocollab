import { ValidationError } from '../../errors/common/validation-error';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Abstract base class for UUID-based value objects.
 * All entity and value-object identifiers share this base, enabling
 * cross-type equality checks via `instanceof` + constructor comparison.
 *
 * @invariant `_value` must be a valid UUID v4 string (enforced by `validateUuid`).
 */
export abstract class Uuid {
  protected constructor(protected readonly _value: string) {}

  /** @returns The UUID string. */
  get value(): string {
    return this._value;
  }

  /**
   * Compares this identifier with another for equality.
   * Two identifiers are equal only when they share the same concrete class
   * and the same underlying UUID value.
   * 
   * @param other - The value to compare against.
   * @returns True if both are the same type of ID with the same UUID value.
   */
  equals(other: unknown): boolean {
    return (
      other instanceof Uuid &&
      other.constructor === this.constructor &&
      this._value === other._value
    );
  }
}

/**
 * Validates that a string is a properly formatted UUID v4.
 * 
 * @param value - The string to validate.
 * @param name - The human-readable name of the identifier (used in error messages).
 * @throws {ValidationError} If the value is not a valid UUID v4 format.
 */
export function validateUuid(value: string, name: string): void {
  if (!UUID_V4_REGEX.test(value)) {
    throw new ValidationError(`Invalid ${name} UUID v4 format: ${value}`);
  }
}
