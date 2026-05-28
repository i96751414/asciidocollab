import { createHash } from 'crypto';
import type { BreachChecker } from '@asciidocollab/domain';

/**
 * Configuration for the HIBP breach checker.
 */
export interface HibpBreachCheckerConfig {
  /** The HIBP API base URL. */
  hibpApiUrl: string;
}

/**
 * Have I Been Pwned k-anonymity breach checker implementation.
 *
 * Uses the HIBP API to check if a password has been exposed in data breaches.
 * Implements k-anonymity by sending only the first 5 characters of the SHA-1 hash.
 */
export class HIBPBreachChecker implements BreachChecker {
  /**
   * @param config - HIBP API configuration.
   */
  constructor(private readonly config: HibpBreachCheckerConfig) {}

  /**
   * Checks if a password appears in known breach databases.
   *
   * @param password - The password to check.
   * @returns True if the password is breached, false otherwise.
   */
  async isBreached(password: string): Promise<boolean> {
    const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    try {
      const response = await fetch(`${this.config.hibpApiUrl}/${prefix}`);
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
}
