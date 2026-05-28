/**
 * Interface for sending email messages.
 */
export interface EmailSender {
  /**
   * Sends an email message.
   *
   * @param to - The recipient email address.
   * @param subject - The email subject line.
   * @param html - The email body in HTML format.
   * @returns A promise that resolves when the email is sent.
   */
  send(to: string, subject: string, html: string): Promise<void>;
}
