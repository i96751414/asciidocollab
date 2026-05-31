/** Notifier for password reset events. */
export interface PasswordResetNotifier {
  /**
   * Sends a password reset email to the user.
   *
   * @param to - Recipient email address.
   * @param rawToken - The unhashed reset token to embed in the link.
   * @returns A promise that resolves when the notification has been dispatched.
   */
  sendResetEmail(to: string, rawToken: string): Promise<void>;
}
