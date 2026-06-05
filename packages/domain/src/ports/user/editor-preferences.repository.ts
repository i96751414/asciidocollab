import type { EditorPreferences } from '../../entities/editor-preferences';
import type { UserId } from '../../value-objects/user-id';

export interface EditorPreferencesRepository {
  findByUserId(userId: UserId): Promise<EditorPreferences | null>;
  save(prefs: EditorPreferences): Promise<void>;
}
