/**
 * Interface for checking if a password has been exposed in a data breach.
 */
export interface BreachChecker {
  /**
   * Checks if a password appears in known breach databases.
   *
   * @param password - The password to check.
   * @returns A promise that resolves to true if the password is breached, false otherwise.
   */
  isBreached(password: string): Promise<boolean>;
}
