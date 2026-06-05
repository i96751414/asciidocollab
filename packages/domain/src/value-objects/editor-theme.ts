import type { Result } from '../types/result';
import { ValidationError } from '../errors/validation-error';

export type EditorThemeValue = 'default' | 'high-contrast';

const VALID_THEMES: readonly EditorThemeValue[] = ['default', 'high-contrast'];

export class EditorTheme {
  private constructor(public readonly value: EditorThemeValue) {}

  static parse(raw: string): Result<EditorTheme, ValidationError> {
    if (VALID_THEMES.includes(raw as EditorThemeValue)) {
      return { success: true, value: new EditorTheme(raw as EditorThemeValue) };
    }
    return {
      success: false,
      error: new ValidationError(`Invalid editor theme: "${raw}". Must be one of: ${VALID_THEMES.join(', ')}`),
    };
  }
}
