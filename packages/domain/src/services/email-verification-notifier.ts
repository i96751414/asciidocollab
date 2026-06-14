import type { Email } from '../value-objects/identity/email';

/** Service interface for sending email-verification messages. */
export interface EmailVerificationNotifier {
  /**
   * Sends the initial email-verification message to the user.
   *
   * @param recipientEmail - The recipient's email address.
   * @param rawToken - The raw (unhashed) verification token to embed in the link.
   * @returns A promise that resolves when the email is sent.
   */
  sendVerificationEmail(recipientEmail: Email, rawToken: string): Promise<void>;
  /**
   * Sends a re-send email-verification message to the user.
   *
   * @param recipientEmail - The recipient's email address.
   * @param rawToken - The raw (unhashed) verification token to embed in the link.
   * @returns A promise that resolves when the email is sent.
   */
  sendResendVerificationEmail(recipientEmail: Email, rawToken: string): Promise<void>;
}
