import { ValidationError } from '../errors/validation-error';

const TRAVERSAL = /(^|\/|\\)(\.\.|\.)(\/|\\|$)/;
const VALID_PATH = /^\/[a-zA-Z0-9_\-./]*$/;

/**
 * Represents a file path with security validation.
 * Enforces that the path starts with '/', prevents path traversal sequences
 * (e.g. '..', '.'), and restricts to safe characters.
 */
export class FilePath {
  private constructor(private readonly _value: string) {}

  /**
   * Creates a new FilePath instance after validating the input.
   * Validates that the path starts with '/', contains no path traversal
   * sequences, and uses only safe characters.
   * @param value - The file path string to validate and wrap
   * @returns A new FilePath instance
   * @throws {ValidationError} If the value fails any path validation check
   */
  static create(value: string): FilePath {
    if (!value || !value.startsWith('/')) {
      throw new ValidationError(`Invalid FilePath: must start with /. Got: ${value}`);
    }
    if (TRAVERSAL.test(value)) {
      throw new ValidationError(`Invalid FilePath: path traversal sequences not allowed. Got: ${value}`);
    }
    if (!VALID_PATH.test(value)) {
      throw new ValidationError(`Invalid FilePath: invalid characters. Got: ${value}`);
    }
    return new FilePath(value);
  }

  /**
   * Returns the raw file path string.
   */
  get value(): string {
    return this._value;
  }

  /**
   * Compares this FilePath with another value for equality.
   * @param other - The value to compare against
   * @returns true if both are FilePath instances with the same value
   */
  equals(other: unknown): boolean {
    return other instanceof FilePath && this._value === other._value;
  }
}
