/** Notifier for password reset events. */
export interface PasswordResetNotifier {
  /**
   * Sends a password reset email to the user.
   *
   * @param to - Recipient email address.
   * @param rawToken - The unhashed reset token to embed in the link.
   */
  sendResetEmail(to: string, rawToken: string): Promise<void>;
}
