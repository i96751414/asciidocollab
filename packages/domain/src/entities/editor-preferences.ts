import { EditorPreferencesId } from '../value-objects/editor-preferences-id';
import { EditorTheme } from '../value-objects/editor-theme';
import { PreviewStyle } from '../value-objects/preview-style';
import { UserId } from '../value-objects/user-id';
import { Timestamps } from '../value-objects/timestamps';
import { ValidationError } from '../errors/validation-error';
import {
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  DEFAULT_SPELLCHECK_LANGUAGE,
  DEFAULT_SPELLCHECK_ENABLED,
  isSpellcheckLanguage,
  type SpellcheckLanguage,
} from '../constants/editor-preferences';

/** Stores a user's editor display preferences (font size, theme, scroll sync, soft wrap, preview style, spellcheck). */
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
   * @param previewStyle - Selected preview rendering style; defaults to the brand look.
   * @param spellcheckLanguage - Document language for spellcheck; must be a supported language code.
   * @param spellcheckEnabled - When false, spellcheck produces no diagnostics regardless of language.
   */
  constructor(
    public readonly id: EditorPreferencesId,
    public readonly userId: UserId,
    public readonly fontSize: number,
    public readonly theme: EditorTheme,
    public readonly scrollSyncEnabled: boolean = false,
    timestamps?: Timestamps,
    public readonly softWrap: boolean = true,
    public readonly previewStyle: PreviewStyle = PreviewStyle.default(),
    public readonly spellcheckLanguage: SpellcheckLanguage = DEFAULT_SPELLCHECK_LANGUAGE,
    public readonly spellcheckEnabled: boolean = DEFAULT_SPELLCHECK_ENABLED,
  ) {
    if (fontSize < FONT_SIZE_MIN || fontSize > FONT_SIZE_MAX) {
      throw new ValidationError(
        `fontSize must be between ${FONT_SIZE_MIN} and ${FONT_SIZE_MAX}, got ${fontSize}`,
      );
    }
    if (!isSpellcheckLanguage(spellcheckLanguage)) {
      throw new ValidationError(`unsupported spellcheck language: ${spellcheckLanguage}`);
    }
    this.timestamps = timestamps ?? new Timestamps();
  }
}
