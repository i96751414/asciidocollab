import type { Result } from '../types/result';
import { ValidationError } from '../errors/validation-error';

/** The set of supported editor theme identifiers. */
export type EditorThemeValue = 'default' | 'high-contrast';

const VALID_THEMES: readonly string[] = ['default', 'high-contrast'] satisfies EditorThemeValue[];

function isEditorThemeValue(value: string): value is EditorThemeValue {
  return VALID_THEMES.includes(value);
}

/** Validated value object representing an editor colour theme. */
export class EditorTheme {
  private constructor(public readonly value: EditorThemeValue) {}

  /**
   * Parses a raw string into an EditorTheme, returning a failure result if unrecognised.
   *
   * @param raw - The raw theme string to validate.
   * @returns A Result containing the EditorTheme on success, or a ValidationError on failure.
   */
  static parse(raw: string): Result<EditorTheme, ValidationError> {
    if (isEditorThemeValue(raw)) {
      return { success: true, value: new EditorTheme(raw) };
    }
    return {
      success: false,
      error: new ValidationError(`Invalid editor theme: "${raw}". Must be one of: ${VALID_THEMES.join(', ')}`),
    };
  }
}
