/**
 * Interface for hashing and verifying passwords.
 *
 * Implementations should use a secure, slow hashing algorithm (e.g., argon2id, bcrypt).
 */
export interface PasswordHasher {
  /**
   * Hashes a plaintext password.
   *
   * @param plain - The plaintext password to hash.
   * @returns A promise that resolves to the hashed password.
   */
  hash(plain: string): Promise<string>;

  /**
   * Verifies a plaintext password against a hash.
   *
   * @param hash - The stored password hash.
   * @param plain - The plaintext password to verify.
   * @returns A promise that resolves to true if the password matches, false otherwise.
   */
  verify(hash: string, plain: string): Promise<boolean>;
}
