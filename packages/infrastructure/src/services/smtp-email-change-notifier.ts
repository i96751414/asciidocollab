import type { EmailSender, EmailChangeNotifier } from '@asciidocollab/domain';

/** Sends email change confirmation emails via the injected EmailSender. */
export class SmtpEmailChangeNotifier implements EmailChangeNotifier {
  /**
   * @param emailSender - The email delivery service.
   * @param subject - Subject line for the confirmation email.
   * @param htmlTemplate - HTML body template; use `{token}` as the token placeholder.
   */
  constructor(
    private readonly emailSender: EmailSender,
    private readonly subject: string,
    private readonly htmlTemplate: string,
  ) {}

  /**
   * Sends an email change confirmation email with the raw token embedded in the link.
   *
   * @param to - The new (pending) email address to confirm.
   * @param rawToken - The unhashed confirmation token.
   * @returns A promise that resolves when the email is sent.
   */
  async sendConfirmationEmail(to: string, rawToken: string): Promise<void> {
    const html = this.htmlTemplate.replace('{token}', rawToken);
    await this.emailSender.send(to, this.subject, html);
  }
}
