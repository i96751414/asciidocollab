import type { EditorPreferencesRepository } from '../../ports/user/editor-preferences.repository';
import type { UserId } from '../../value-objects/user-id';
import type { Result } from '../../types/result';
import { EditorPreferences } from '../../entities/editor-preferences';
import { EditorPreferencesId } from '../../value-objects/editor-preferences-id';
import { EditorTheme } from '../../value-objects/editor-theme';
import { PreviewStyle } from '../../value-objects/preview-style';
import { ValidationError } from '../../errors/validation-error';
import { randomUUID } from 'node:crypto';

interface SaveEditorPreferencesInput {
  fontSize: number;
  theme: string;
  scrollSyncEnabled?: boolean;
  softWrap?: boolean;
  previewStyle?: string;
}

/** Validates and persists updated editor preferences for a user. */
export class SaveEditorPreferencesUseCase {
  /** @param repo - The editor preferences repository. */
  constructor(private readonly repo: EditorPreferencesRepository) {}

  /**
   * Executes the use case.
   *
   * @param userId - The user whose preferences to update.
   * @param input - The new preference values to apply.
   * @returns A successful result, or a failure with a validation error.
   */
  async execute(
    userId: UserId,
    input: SaveEditorPreferencesInput,
  ): Promise<Result<void, ValidationError>> {
    const themeResult = EditorTheme.parse(input.theme);
    if (!themeResult.success) {
      return { success: false, error: themeResult.error };
    }

    let prefs: EditorPreferences;
    try {
      const existing = await this.repo.findByUserId(userId);
      const id = existing?.id ?? EditorPreferencesId.create(randomUUID());
      const scrollSyncEnabled = input.scrollSyncEnabled ?? existing?.scrollSyncEnabled ?? false;
      const softWrap = input.softWrap ?? existing?.softWrap ?? true;

      let previewStyle = existing?.previewStyle ?? PreviewStyle.default();
      if (input.previewStyle !== undefined) {
        const previewStyleResult = PreviewStyle.parse(input.previewStyle);
        if (!previewStyleResult.success) {
          return { success: false, error: previewStyleResult.error };
        }
        previewStyle = previewStyleResult.value;
      }

      prefs = new EditorPreferences(id, userId, input.fontSize, themeResult.value, scrollSyncEnabled, existing?.timestamps, softWrap, previewStyle);
    } catch (error) {
      if (error instanceof ValidationError) {
        return { success: false, error: error };
      }
      throw error;
    }

    await this.repo.save(prefs);
    return { success: true, value: undefined };
  }
}
