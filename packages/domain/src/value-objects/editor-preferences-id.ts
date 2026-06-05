import { Uuid, validateUuid } from './uuid';

export class EditorPreferencesId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): EditorPreferencesId {
    validateUuid(value, 'EditorPreferencesId');
    return new EditorPreferencesId(value);
  }
}
