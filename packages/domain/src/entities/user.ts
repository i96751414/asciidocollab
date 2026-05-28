import { UserId } from '../value-objects/user-id';
import { Email } from '../value-objects/email';
import { Timestamps } from '../value-objects/timestamps';

/**
 * Represents a registered user in the system.
 *
 * A User can authenticate via password (passwordHash), SAML SSO (samlSubject),
 * or both. At least one authentication method must be provided.
 *
 * @invariant At least one of `passwordHash` or `samlSubject` must be non-null.
 */
export class User {
  /**
   * @throws {Error} If both `passwordHash` and `samlSubject` are null.
   */
  constructor(
    /** Unique identifier for the user. */
    public readonly id: UserId,
    /** Verified email address used for login and notifications. */
    public readonly email: Email,
    /** Human-readable display name shown in the UI. */
    public readonly displayName: string,
    /**
     * Argon2id hash of the user's password, or null if the user authenticates
     * exclusively via SAML. At least one of `passwordHash` or `samlSubject`
     * must be provided.
     */
    public readonly passwordHash: string | null,
    /**
     * Argon2id hashes of the last N passwords for history enforcement (FR-027).
     * Oldest first. Empty array when no history exists.
     */
    public readonly passwordHistory: string[],
    /**
     * SAML subject identifier, or null if the user authenticates exclusively
     * via password. At least one of `passwordHash` or `samlSubject` must be
     * provided.
     */
    public readonly samlSubject: string | null,
    /**
     * Secret used for TOTP multi-factor authentication, or null if MFA is not
     *  enabled.
     */
    public readonly mfaSecret: string | null,
    /** Creation and last-update timestamps. Defaults to the current time. */
    public readonly timestamps: Timestamps = new Timestamps(),
  ) {
    if (!this.passwordHash && !this.samlSubject) {
      throw new Error('User must have at least one of passwordHash or samlSubject');
    }
  }

  /** @returns A defensive copy of the creation date. */
  get createdAt(): Date {
    return this.timestamps.createdAt;
  }

  /** @returns A defensive copy of the last-update date. */
  get updatedAt(): Date {
    return this.timestamps.updatedAt;
  }
}
