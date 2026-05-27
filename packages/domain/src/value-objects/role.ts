import { ValidationError } from '../errors/validation-error';

/**
 * Represents a user role with restricted access levels.
 * Valid values are 'viewer', 'editor', and 'administrator'.
 */
export class Role {
  private constructor(private readonly _value: string) {}

  /**
   * Creates a new Role instance after validating the input.
   * @param value - The role string; must be 'viewer', 'editor', or 'administrator'
   * @returns A new Role instance
   * @throws {ValidationError} If the value is not a valid role
   */
  static create(value: string): Role {
    if (value !== 'viewer' && value !== 'editor' && value !== 'administrator') {
      throw new ValidationError(`Invalid Role: ${value}`);
    }
    return new Role(value);
  }

  /**
   * Returns the raw role string.
   */
  get value(): string {
    return this._value;
  }

  /**
   * Compares this Role with another value for equality.
   * @param other - The value to compare against
   * @returns true if both are Role instances with the same value
   */
  equals(other: unknown): boolean {
    return other instanceof Role && this._value === other._value;
  }
}
