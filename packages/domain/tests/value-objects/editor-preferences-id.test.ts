import { EditorPreferencesId } from '../../src/value-objects/ids/editor-preferences-id';
import { ValidationError } from '../../src/errors/common/validation-error';

describe('EditorPreferencesId', () => {
  test('constructs from a valid UUID v4', () => {
    const id = EditorPreferencesId.create('550e8400-e29b-41d4-a716-446655440000');
    expect(id.value).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  test('rejects empty string', () => {
    expect(() => EditorPreferencesId.create('')).toThrow(ValidationError);
  });

  test('rejects non-UUID string', () => {
    expect(() => EditorPreferencesId.create('not-a-uuid')).toThrow(ValidationError);
  });
});
