/** Notifier for email address change events. */
export interface EmailChangeNotifier {
  /**
   * Sends a confirmation email to the new address.
   *
   * @param to - The new (pending) email address.
   * @param rawToken - The unhashed confirmation token to embed in the link.
   */
  sendConfirmationEmail(to: string, rawToken: string): Promise<void>;
}
