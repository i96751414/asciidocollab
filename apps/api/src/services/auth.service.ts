import * as argon2 from 'argon2';
import { getConfig } from '../config';

/**
 * Hashes a password using argon2id.
 *
 * @param password - The plaintext password to hash.
 * @returns The argon2id hash of the password.
 */
export async function hashPassword(password: string): Promise<string> {
  const config = getConfig();
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: config.auth.password.hashMemory,
    timeCost: config.auth.password.hashTime,
    parallelism: config.auth.password.hashParallelism,
  });
}

/**
 * Verifies a password against an argon2id hash.
 *
 * @param hash - The argon2id hash to verify against.
 * @param password - The plaintext password to verify.
 * @returns True if the password matches the hash, false otherwise.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
