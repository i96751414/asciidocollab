import { ValidationError } from '../errors/validation-error';

/**
 * Represents a MIME type string.
 * Validates that the value follows the 'type/subtype' format.
 */
export class MimeType {
  private constructor(private readonly _value: string) {}

  /**
   * Creates a new MimeType instance after validating the input.
   * 
   * @param value - The MIME type string; must contain '/' (type/subtype format).
   * @returns A new MimeType instance.
   * @throws {ValidationError} If the value does not contain '/'.
   */
  static create(value: string): MimeType {
    if (!value || !value.includes('/')) {
      throw new ValidationError(`Invalid MimeType: must contain '/'. Got: ${value}`);
    }
    return new MimeType(value);
  }

  /** @returns The raw MIME type string. */
  get value(): string {
    return this._value;
  }

  /**
   * Compares this MimeType with another value for equality.
   * 
   * @param other - The value to compare against.
   * @returns True if both are MimeType instances with the same value.
   */
  equals(other: unknown): boolean {
    return other instanceof MimeType && this._value === other._value;
  }
}
