import { EditorPreferences } from '../../src/entities/editor-preferences';
import { EditorPreferencesId } from '../../src/value-objects/editor-preferences-id';
import { EditorTheme } from '../../src/value-objects/editor-theme';
import { UserId } from '../../src/value-objects/user-id';
import { ValidationError } from '../../src/errors/validation-error';

const validId = EditorPreferencesId.create('550e8400-e29b-41d4-a716-446655440000');
const validUserId = UserId.create('660e8400-e29b-41d4-a716-446655440001');
const defaultTheme = (EditorTheme.parse('default') as { success: true; value: EditorTheme }).value;

describe('EditorPreferences entity', () => {
  test('constructs with valid fields', () => {
    const prefs = new EditorPreferences(validId, validUserId, 14, defaultTheme);
    expect(prefs.id).toBe(validId);
    expect(prefs.userId).toBe(validUserId);
    expect(prefs.fontSize).toBe(14);
    expect(prefs.theme).toBe(defaultTheme);
  });

  test('fontSize below 8 throws ValidationError', () => {
    expect(() => new EditorPreferences(validId, validUserId, 7, defaultTheme))
      .toThrow(ValidationError);
  });

  test('fontSize above 32 throws ValidationError', () => {
    expect(() => new EditorPreferences(validId, validUserId, 33, defaultTheme))
      .toThrow(ValidationError);
  });

  test('fontSize at minimum (8) is valid', () => {
    expect(() => new EditorPreferences(validId, validUserId, 8, defaultTheme)).not.toThrow();
  });

  test('fontSize at maximum (32) is valid', () => {
    expect(() => new EditorPreferences(validId, validUserId, 32, defaultTheme)).not.toThrow();
  });

  test('updatedAt reflects construction timestamp', () => {
    const before = new Date();
    const prefs = new EditorPreferences(validId, validUserId, 14, defaultTheme);
    const after = new Date();
    expect(prefs.timestamps.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(prefs.timestamps.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
