import type { EditorPreferencesRepository } from '../../ports/user/editor-preferences.repository';
import type { UserId } from '../../value-objects/user-id';
import type { EditorPreferences } from '../../entities/editor-preferences';
import type { Result } from '../../types/result';
import { EditorPreferencesId } from '../../value-objects/editor-preferences-id';
import { EditorTheme } from '../../value-objects/editor-theme';
import { EditorPreferences as EditorPreferencesEntity } from '../../entities/editor-preferences';
import { DEFAULT_FONT_SIZE, DEFAULT_THEME } from '../../constants/editor-preferences';
import { randomUUID } from 'node:crypto';

/** Returns the user's saved editor preferences, or default values if none are stored. */
export class GetEditorPreferencesUseCase {
  /** @param repo - The editor preferences repository. */
  constructor(private readonly repo: EditorPreferencesRepository) {}

  /**
   * Executes the use case.
   *
   * @param userId - The user whose preferences to retrieve.
   * @returns A successful result containing the preferences (never fails).
   */
  async execute(userId: UserId): Promise<Result<EditorPreferences, never>> {
    const existing = await this.repo.findByUserId(userId);
    if (existing) {
      return { success: true, value: existing };
    }

    const themeResult = EditorTheme.parse(DEFAULT_THEME);
    if (!themeResult.success) {
      throw new Error(`Failed to parse default theme "${DEFAULT_THEME}": ${themeResult.error.message}`);
    }
    const defaultPrefs = new EditorPreferencesEntity(
      EditorPreferencesId.create(randomUUID()),
      userId,
      DEFAULT_FONT_SIZE,
      themeResult.value,
    );
    return { success: true, value: defaultPrefs };
  }
}
