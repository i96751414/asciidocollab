import * as argon2 from 'argon2';
import type { PasswordHasher } from '@asciidocollab/domain';

/**
 * Configuration for the argon2id password hasher.
 */
export interface Argon2Config {
  /** Memory cost in KiB. */
  memoryCost: number;
  /** Number of iterations. */
  timeCost: number;
  /** Degree of parallelism. */
  parallelism: number;
}

/**
 * Argon2id-based password hasher implementation.
 */
export class Argon2PasswordHasher implements PasswordHasher {
  /**
   * @param config - Argon2id configuration parameters.
   */
  constructor(private readonly config: Argon2Config) {}

  /**
   * Hashes a plaintext password using argon2id.
   *
   * @param plain - The plaintext password to hash.
   * @returns The argon2id hash.
   */
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: this.config.memoryCost,
      timeCost: this.config.timeCost,
      parallelism: this.config.parallelism,
    });
  }

  /**
   * Verifies a plaintext password against an argon2id hash.
   *
   * @param hash - The stored argon2id hash.
   * @param plain - The plaintext password to verify.
   * @returns True if the password matches, false otherwise.
   */
  async verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }
}
