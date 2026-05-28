import { readFileSync } from 'node:fs';
import path from 'node:path';

function loadCommonPasswords(): Set<string> {
  const filePath = path.join(__dirname, '..', '..', 'data', 'common-passwords.txt');
  const content = readFileSync(filePath, 'utf8');
  return new Set(
    content
      .split('\n')
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line.length > 0)
  );
}

const COMMON_PASSWORDS = loadCommonPasswords();

/**
 * Checks if a password is in the common passwords blocklist.
 *
 * @param password - The password to check.
 * @returns True if the password is common, false otherwise.
 */
export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}
