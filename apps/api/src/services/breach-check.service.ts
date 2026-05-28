import { createHash } from 'crypto';
import { getConfig } from '../config';

/**
 * Checks if a password has been exposed in a data breach using HIBP k-anonymity.
 *
 * @param password - The password to check.
 * @returns True if the password has been breached, false otherwise.
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  const config = getConfig();
  const hibpApiUrl = config.auth.breachCheck.hibpApiUrl;
  const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  try {
    const response = await fetch(`${hibpApiUrl}/${prefix}`);
    if (!response.ok) {
      return false;
    }
    const body = await response.text();
    const lines = body.split('\n');
    return lines.some((line) => line.startsWith(suffix));
  } catch {
    return false;
  }
}
