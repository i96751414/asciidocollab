import { ValidationError } from '../../errors/common/validation-error';

/**
 * Represents a user role with restricted access levels.
 * Valid values are 'viewer', 'editor', and 'owner'.
 */
export class Role {
  private constructor(private readonly _value: string) {}

  /**
   * Creates a new Role instance after validating the input.
   *
   * @param value - The role string; must be 'viewer', 'editor', or 'owner'.
   * @returns A new Role instance.
   * @throws {ValidationError} If the value is not a valid role.
   */
  static create(value: string): Role {
    if (
      value !== 'viewer' &&
      value !== 'editor' &&
      value !== 'owner'
    ) {
      throw new ValidationError(`Invalid Role: ${value}`);
    }
    return new Role(value);
  }

  /** @returns The raw role string. */
  get value(): string {
    return this._value;
  }

  /**
   * Compares this Role with another value for equality.
   * 
   * @param other - The value to compare against.
   * @returns True if both are Role instances with the same value.
   */
  equals(other: unknown): boolean {
    return other instanceof Role && this._value === other._value;
  }
}
