import type { EditorPreferencesRepository } from '../../ports/user/editor-preferences.repository';
import type { UserId } from '../../value-objects/user-id';
import type { EditorPreferences } from '../../entities/editor-preferences';
import type { Result } from '../../types/result';
import { EditorPreferencesId } from '../../value-objects/editor-preferences-id';
import { EditorTheme } from '../../value-objects/editor-theme';
import { EditorPreferences as EditorPreferencesEntity } from '../../entities/editor-preferences';
import { DEFAULT_FONT_SIZE, DEFAULT_THEME } from '../../constants/editor-preferences';
import { randomUUID } from 'node:crypto';

export class GetEditorPreferencesUseCase {
  constructor(private readonly repo: EditorPreferencesRepository) {}

  async execute(userId: UserId): Promise<Result<EditorPreferences, never>> {
    const existing = await this.repo.findByUserId(userId);
    if (existing) {
      return { success: true, value: existing };
    }

    const themeResult = EditorTheme.parse(DEFAULT_THEME);
    const theme = (themeResult as { success: true; value: EditorTheme }).value;
    const defaultPrefs = new EditorPreferencesEntity(
      EditorPreferencesId.create(randomUUID()),
      userId,
      DEFAULT_FONT_SIZE,
      theme,
    );
    return { success: true, value: defaultPrefs };
  }
}
