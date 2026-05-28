/**
 * Interface for checking if a password is in a common passwords blocklist.
 */
export interface CommonPasswordChecker {
  /**
   * Checks if a password is commonly used.
   *
   * @param password - The password to check.
   * @returns True if the password is common, false otherwise.
   */
  isCommon(password: string): boolean;
}
