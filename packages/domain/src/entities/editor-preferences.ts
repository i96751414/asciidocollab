import { EditorPreferencesId } from '../value-objects/editor-preferences-id';
import { EditorTheme } from '../value-objects/editor-theme';
import { UserId } from '../value-objects/user-id';
import { Timestamps } from '../value-objects/timestamps';
import { ValidationError } from '../errors/validation-error';
import { FONT_SIZE_MIN, FONT_SIZE_MAX } from '../constants/editor-preferences';

/** Stores a user's editor display preferences (font size, theme, scroll sync, and soft wrap). */
export class EditorPreferences {
  public readonly timestamps: Timestamps;

  /**
   * @param id - Unique identifier for this preferences record.
   * @param userId - Owner of this preferences record.
   * @param fontSize - Font size in pixels; must be between FONT_SIZE_MIN and FONT_SIZE_MAX.
   * @param theme - Selected editor theme.
   * @param scrollSyncEnabled - When true, preview scrolls to match editor scroll position.
   * @param timestamps - Optional creation/update timestamps; defaults to now.
   * @param softWrap - When true, the editor wraps long lines instead of scrolling horizontally.
   */
  constructor(
    public readonly id: EditorPreferencesId,
    public readonly userId: UserId,
    public readonly fontSize: number,
    public readonly theme: EditorTheme,
    public readonly scrollSyncEnabled: boolean = false,
    timestamps?: Timestamps,
    public readonly softWrap: boolean = true,
  ) {
    if (fontSize < FONT_SIZE_MIN || fontSize > FONT_SIZE_MAX) {
      throw new ValidationError(
        `fontSize must be between ${FONT_SIZE_MIN} and ${FONT_SIZE_MAX}, got ${fontSize}`,
      );
    }
    this.timestamps = timestamps ?? new Timestamps();
  }
}
