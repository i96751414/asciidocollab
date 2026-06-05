import type { EditorPreferences } from '../../../src/entities/editor-preferences';
import type { UserId } from '../../../src/value-objects/user-id';
import type { EditorPreferencesRepository } from '../../../src/ports/user/editor-preferences.repository';

export class InMemoryEditorPreferencesRepository implements EditorPreferencesRepository {
  private readonly store = new Map<string, EditorPreferences>();

  async findByUserId(userId: UserId): Promise<EditorPreferences | null> {
    return this.store.get(userId.value) ?? null;
  }

  async save(prefs: EditorPreferences): Promise<void> {
    this.store.set(prefs.userId.value, prefs);
  }
}
