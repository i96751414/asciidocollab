import { ValidationError } from '../../errors/common/validation-error';

/**
 * Represents a supported Git hosting provider.
 * Restricts valid values to 'github', 'gitlab', or 'bitbucket'.
 */
export class GitProvider {
  private constructor(private readonly _value: string) {}

  /**
   * Creates a new GitProvider instance after validating the input.
   * 
   * @param value - The git provider name; must be 'github', 'gitlab', or 'bitbucket'.
   * @returns A new GitProvider instance.
   * @throws {ValidationError} If the value is not a recognized git provider.
   */
  static create(value: string): GitProvider {
    if (value !== 'github' && value !== 'gitlab' && value !== 'bitbucket') {
      throw new ValidationError(`Invalid GitProvider: ${value}`);
    }
    return new GitProvider(value);
  }

  /** @returns The raw git provider name string. */
  get value(): string {
    return this._value;
  }

  /**
   * Compares this GitProvider with another value for equality.
   * 
   * @param other - The value to compare against.
   * @returns True if both are GitProvider instances with the same value.
   */
  equals(other: unknown): boolean {
    return other instanceof GitProvider && this._value === other._value;
  }
}
