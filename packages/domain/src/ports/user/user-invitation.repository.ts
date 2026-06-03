import { UserInvitation } from '../../entities/user-invitation';
import { Email } from '../../value-objects/email';

/** Repository interface for persisting and retrieving user invitations. */
export interface UserInvitationRepository {
  /**
   * Persists a user invitation (create or update).
   *
   * @param invitation - The invitation entity to save.
   * @returns A promise that resolves when the invitation is persisted.
   */
  save(invitation: UserInvitation): Promise<void>;
  /**
   * Finds an invitation by its hashed token value.
   *
   * @param tokenHash - SHA-256 hash of the raw invitation token.
   * @returns The invitation if found, null otherwise.
   */
  findByTokenHash(tokenHash: string): Promise<UserInvitation | null>;
  /**
   * Finds an unexpired, unaccepted invitation for the given email address.
   *
   * @param email - The recipient email address to search by.
   * @returns The pending invitation if found, null otherwise.
   */
  findPendingByEmail(email: Email): Promise<UserInvitation | null>;
  /**
   * Returns all stored invitations regardless of status.
   *
   * @returns An array of all invitations.
   */
  findAll(): Promise<UserInvitation[]>;
}
