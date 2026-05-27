/**
 * Represents a file node type (file or folder).
 * Restricts valid values to either 'file' or 'folder'.
 */
export class FileNodeType {
  private constructor(private readonly _value: string) {}

  /**
   * Creates a new FileNodeType instance after validating the input.
   * @param value - The file node type string; must be 'file' or 'folder'
   * @returns A new FileNodeType instance
   * @throws {Error} If the value is not 'file' or 'folder'
   */
  static create(value: string): FileNodeType {
    if (value !== 'file' && value !== 'folder') {
      throw new Error(`Invalid FileNodeType: ${value}`);
    }
    return new FileNodeType(value);
  }

  /**
   * Returns the raw file node type string ('file' or 'folder').
   */
  get value(): string {
    return this._value;
  }

  /**
   * Compares this FileNodeType with another value for equality.
   * @param other - The value to compare against
   * @returns true if both are FileNodeType instances with the same value
   */
  equals(other: unknown): boolean {
    return other instanceof FileNodeType && this._value === other._value;
  }
}
