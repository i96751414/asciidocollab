import type { Email } from '../value-objects/identity/email';

/** Service interface for sending registration-invitation emails. */
export interface RegistrationInvitationNotifier {
  /**
   * Sends a registration invitation email to the given address.
   *
   * @param recipientEmail - The email address to invite.
   * @param rawToken - The raw (unhashed) invitation token to embed in the link.
   * @param invitedBy - Display name of the admin who sent the invitation.
   * @returns A promise that resolves when the invitation email is sent.
   */
  sendInvitation(recipientEmail: Email, rawToken: string, invitedBy: string): Promise<void>;
}
