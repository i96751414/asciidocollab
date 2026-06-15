import { Uuid, validateUuid } from './uuid';

/** Strongly-typed UUID that identifies an EditorPreferences record. */
export class EditorPreferencesId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  /**
   * Creates a validated EditorPreferencesId from a UUID string.
   *
   * @param value - A valid UUID v4 string.
   * @returns A new EditorPreferencesId instance.
   */
  static create(value: string): EditorPreferencesId {
    validateUuid(value, 'EditorPreferencesId');
    return new EditorPreferencesId(value);
  }
}
