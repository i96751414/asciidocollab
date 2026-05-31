import type { EmailSender, PasswordResetNotifier } from '@asciidocollab/domain';

/** Sends password reset emails via the injected EmailSender. */
export class SmtpPasswordResetNotifier implements PasswordResetNotifier {
  /**
   * @param emailSender - The email delivery service.
   * @param subject - Subject line for the reset email.
   * @param htmlTemplate - HTML body template; use `{token}` as the token placeholder.
   */
  constructor(
    private readonly emailSender: EmailSender,
    private readonly subject: string,
    private readonly htmlTemplate: string,
  ) {}

  /**
   * Sends a password reset email with the raw token embedded in the link.
   *
   * @param to - Recipient email address.
   * @param rawToken - The unhashed reset token.
   * @returns A promise that resolves when the email is sent.
   */
  async sendResetEmail(to: string, rawToken: string): Promise<void> {
    const html = this.htmlTemplate.replaceAll('{token}', rawToken);
    await this.emailSender.send(to, this.subject, html);
  }
}
