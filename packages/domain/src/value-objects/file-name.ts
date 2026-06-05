import { ValidationError } from '../errors/validation-error';

// Characters that are invalid on at least one major OS or that break path parsing:
//   null byte         — invalid everywhere
//   \r\n  line terminators — break path parsing
//   /     path separator   — would create sub-directories
//   \     Windows path sep — interpreted as directory separator on Windows
const INVALID_CHARS = /[\r\n/\\]/;
const NULL_CHAR = String.fromCodePoint(0);

// Names that are reserved on Windows (case-insensitive, with or without extension).
// Storing these as filenames on a Windows host silently breaks I/O.
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;

/**
 * Represents a validated file or folder name (a single path segment, not a full path).
 * Rejects names with path separators, control characters, path traversal, and Windows
 * reserved device names.
 */
export class FileName {
  private constructor(private readonly _value: string) {}

  /**
   * Creates a validated FileName from a string.
   *
   * @param value - The raw file name string to validate.
   * @returns A new FileName instance.
   */
  static create(value: string): FileName {
    if (!value || value.trim() === '') {
      throw new ValidationError(`Invalid FileName: name must not be empty. Got: ${JSON.stringify(value)}`);
    }
    if (value !== value.trim()) {
      throw new ValidationError(`Invalid FileName: name must not have leading or trailing whitespace. Got: ${JSON.stringify(value)}`);
    }
    if (value === '.' || value === '..') {
      throw new ValidationError(`Invalid FileName: "." and ".." are not allowed. Got: ${JSON.stringify(value)}`);
    }
    if (INVALID_CHARS.test(value) || value.includes(NULL_CHAR)) {
      throw new ValidationError(String.raw`Invalid FileName: contains invalid characters (/, \, newline, or null). Got: ${JSON.stringify(value)}`);
    }
    if (WINDOWS_RESERVED.test(value)) {
      throw new ValidationError(`Invalid FileName: "${value}" is a reserved device name.`);
    }
    return new FileName(value);
  }

  /**
   * Returns the validated file name string.
   *
   * @returns The raw file name value.
   */
  get value(): string {
    return this._value;
  }

  /**
   * Checks structural equality with another value.
   *
   * @param other - The value to compare against.
   * @returns True if other is a FileName with the same value.
   */
  equals(other: unknown): boolean {
    return other instanceof FileName && this._value === other._value;
  }
}
