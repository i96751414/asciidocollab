import type { EditorPreferencesRepository } from '../../ports/user/editor-preferences.repository';
import type { UserId } from '../../value-objects/user-id';
import type { Result } from '../../types/result';
import { EditorPreferences } from '../../entities/editor-preferences';
import { EditorPreferencesId } from '../../value-objects/editor-preferences-id';
import { EditorTheme } from '../../value-objects/editor-theme';
import { ValidationError } from '../../errors/validation-error';
import { randomUUID } from 'node:crypto';

interface SaveEditorPreferencesInput {
  fontSize: number;
  theme: string;
}

export class SaveEditorPreferencesUseCase {
  constructor(private readonly repo: EditorPreferencesRepository) {}

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
      prefs = new EditorPreferences(id, userId, input.fontSize, themeResult.value, existing?.timestamps);
    } catch (err) {
      if (err instanceof ValidationError) {
        return { success: false, error: err };
      }
      throw err;
    }

    await this.repo.save(prefs);
    return { success: true, value: undefined };
  }
}
