import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { CommonPasswordChecker } from '@asciidocollab/domain';

/**
 * Loads common passwords from a text file and provides a membership check.
 *
 * The file should contain one password per line. Passwords are loaded once
 * at instantiation time and stored in a Set for O(1) lookups.
 */
export class CommonPasswordFileChecker implements CommonPasswordChecker {
  private readonly passwords: Set<string>;

  /**
   * @param filePath - Absolute path to the common passwords text file.
   */
  constructor(filePath: string) {
    const content = readFileSync(filePath, 'utf8');
    this.passwords = new Set(
      content
        .split('\n')
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line.length > 0),
    );
  }

  /**
   * Checks if a password is commonly used.
   *
   * @param password - The password to check.
   * @returns True if the password is common, false otherwise.
   */
  isCommon(password: string): boolean {
    return this.passwords.has(password.toLowerCase());
  }
}

/**
 * Creates a CommonPasswordFileChecker from the default data file location.
 *
 * @param dataDirectory - The directory containing common-passwords.txt.
 * @returns A configured CommonPasswordChecker instance.
 */
export function createCommonPasswordChecker(dataDirectory: string): CommonPasswordFileChecker {
  const filePath = path.join(dataDirectory, 'common-passwords.txt');
  return new CommonPasswordFileChecker(filePath);
}
