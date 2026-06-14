import { EditorTheme } from '../../src/value-objects/editor/editor-theme';
import { ValidationError } from '../../src/errors/common/validation-error';

describe('EditorTheme', () => {
  test('parse("default") succeeds', () => {
    const result = EditorTheme.parse('default');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.value).toBe('default');
  });

  test('parse("high-contrast") succeeds', () => {
    const result = EditorTheme.parse('high-contrast');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.value).toBe('high-contrast');
  });

  test('parse("unknown") returns ValidationError', () => {
    const result = EditorTheme.parse('unknown');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
  });

  test('parse("neon") returns ValidationError', () => {
    const result = EditorTheme.parse('neon');
    expect(result.success).toBe(false);
  });
});
