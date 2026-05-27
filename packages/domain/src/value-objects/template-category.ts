import { ValidationError } from '../errors/validation-error';

/**
 * Represents a template category with length constraints.
 * Validates that the value is non-empty and does not exceed 50 characters.
 */
export class TemplateCategory {
  private constructor(private readonly _value: string) {}

  /**
   * Creates a new TemplateCategory instance after validating the input.
   * 
   * @param value - The template category string; must be non-empty and at most 50 characters.
   * @returns A new TemplateCategory instance.
   * @throws {ValidationError} If the value is empty or exceeds 50 characters.
   */
  static create(value: string): TemplateCategory {
    if (!value) {
      throw new ValidationError('Invalid TemplateCategory: must not be empty');
    }
    if (value.length > 50) {
      throw new ValidationError('Invalid TemplateCategory: must not exceed 50 characters');
    }
    return new TemplateCategory(value);
  }

  /** @returns The raw template category string. */
  get value(): string {
    return this._value;
  }

  /**
   * Compares this TemplateCategory with another value for equality.
   * 
   * @param other - The value to compare against.
   * @returns True if both are TemplateCategory instances with the same value.
   */
  equals(other: unknown): boolean {
    return other instanceof TemplateCategory && this._value === other._value;
  }
}
