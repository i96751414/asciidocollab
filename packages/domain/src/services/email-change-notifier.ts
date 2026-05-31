/** Notifier for email address change events. */
export interface EmailChangeNotifier {
  /**
   * Sends a confirmation email to the new address.
   *
   * @param to - The new (pending) email address.
   * @param rawToken - The unhashed confirmation token to embed in the link.
   * @returns A promise that resolves when the notification has been dispatched.
   */
  sendConfirmationEmail(to: string, rawToken: string): Promise<void>;
}
