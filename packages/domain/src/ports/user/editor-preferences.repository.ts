import type { EditorPreferences } from '../../entities/editor-preferences';
import type { UserId } from '../../value-objects/user-id';

/** Persistence port for user editor preferences. */
export interface EditorPreferencesRepository {
  /**
   * Finds the preferences record for the given user, or null if none exists.
   *
   * @param userId - The user whose preferences to look up.
   * @returns The preferences record, or null if not found.
   */
  findByUserId(userId: UserId): Promise<EditorPreferences | null>;
  /**
   * Persists the given preferences record (insert or update).
   *
   * @param prefs - The preferences record to save.
   * @returns A promise that resolves when the save is complete.
   */
  save(prefs: EditorPreferences): Promise<void>;
}
