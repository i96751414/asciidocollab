import { ValidationError } from '../../errors/common/validation-error';

const RFC_5322_BASIC = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/**
 * Represents an email address.
 * Validates the email format using a basic RFC 5322 regex and normalizes
 * the value to lowercase on creation for consistent comparison.
 */
export class Email {
  private constructor(private readonly _value: string) {}

  /**
   * Creates a new Email instance after validating and normalizing the input.
   * The value is normalized to lowercase for consistent comparison.
   * 
   * @param value - The email address string to validate and wrap.
   * @returns A new Email instance.
   * @throws {ValidationError} If the value is not a valid email format.
   */
  static create(value: string): Email {
    if (!value || !RFC_5322_BASIC.test(value)) {
      throw new ValidationError(`Invalid email format: ${value}`);
    }
    return new Email(value.toLowerCase());
  }

  /** @returns The normalized (lowercase) email address. */
  get value(): string {
    return this._value;
  }

  /**
   * Compares this Email with another value for equality.
   * 
   * @param other - The value to compare against.
   * @returns True if both are Email instances with the same value.
   */
  equals(other: unknown): boolean {
    return other instanceof Email && this._value === other._value;
  }
}
