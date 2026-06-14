import { PreviewStyle } from '../../src/value-objects/editor/preview-style';
import { ValidationError } from '../../src/errors/common/validation-error';

describe('PreviewStyle', () => {
  test('parse("asciidocollab") succeeds', () => {
    const result = PreviewStyle.parse('asciidocollab');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.value).toBe('asciidocollab');
  });

  test('parse("asciidoctor") succeeds', () => {
    const result = PreviewStyle.parse('asciidoctor');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.value).toBe('asciidoctor');
  });

  test('parse rejects the brand-cased display label (tokens are lowercase)', () => {
    const result = PreviewStyle.parse('Asciidocollab');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
  });

  test('parse("unknown") returns ValidationError', () => {
    const result = PreviewStyle.parse('unknown');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
  });
});
