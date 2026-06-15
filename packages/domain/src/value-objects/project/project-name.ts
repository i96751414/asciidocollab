import { InvalidProjectNameError } from '../../errors/project/invalid-project-name';

/**
 * Represents a project name.
 * Validates that the name is non-empty after trimming and does not exceed
 * 100 characters. Uses InvalidProjectNameError for validation failures.
 */
export class ProjectName {
  private constructor(private readonly _value: string) {}

  /**
   * Creates a new ProjectName instance after validating the input.
   * The value is trimmed before validation and storage.
   * 
   * @param value - The project name string to validate and wrap.
   * @returns A new ProjectName instance.
   * @throws {InvalidProjectNameError} If the value is empty or exceeds 100 characters.
   */
  static create(value: string): ProjectName {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new InvalidProjectNameError('Project name must not be empty');
    }
    if (trimmed.length > 100) {
      throw new InvalidProjectNameError('Project name must not exceed 100 characters');
    }
    return new ProjectName(trimmed);
  }

  /** @returns The raw (trimmed) project name string. */
  get value(): string {
    return this._value;
  }

  /**
   * Compares this ProjectName with another value for equality.
   * 
   * @param other - The value to compare against.
   * @returns True if both are ProjectName instances with the same value.
   */
  equals(other: unknown): boolean {
    return other instanceof ProjectName && this._value === other._value;
  }
}
