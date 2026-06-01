/** Repository interface for reading and writing key-value system settings. */
export interface SystemSettingRepository {
  /**
   * Returns the stored value for the given setting key, or null if not set.
   *
   * @param key - The setting key to look up.
   * @returns The stored string value, or null if the key has not been set.
   */
  get(key: string): Promise<string | null>;
  /**
   * Persists a value for the given setting key (create or update).
   *
   * @param key - The setting key to store.
   * @param value - The string value to store.
   * @returns A promise that resolves when the value is persisted.
   */
  set(key: string, value: string): Promise<void>;
}
