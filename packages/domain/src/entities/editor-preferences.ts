import { EditorPreferencesId } from '../value-objects/editor-preferences-id';
import { EditorTheme } from '../value-objects/editor-theme';
import { UserId } from '../value-objects/user-id';
import { Timestamps } from '../value-objects/timestamps';
import { ValidationError } from '../errors/validation-error';
import { FONT_SIZE_MIN, FONT_SIZE_MAX } from '../constants/editor-preferences';

export class EditorPreferences {
  public readonly timestamps: Timestamps;

  constructor(
    public readonly id: EditorPreferencesId,
    public readonly userId: UserId,
    public readonly fontSize: number,
    public readonly theme: EditorTheme,
    timestamps?: Timestamps,
  ) {
    if (fontSize < FONT_SIZE_MIN || fontSize > FONT_SIZE_MAX) {
      throw new ValidationError(
        `fontSize must be between ${FONT_SIZE_MIN} and ${FONT_SIZE_MAX}, got ${fontSize}`,
      );
    }
    this.timestamps = timestamps ?? new Timestamps();
  }
}
