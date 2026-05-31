import type { EmailSender, PasswordResetNotifier } from '@asciidocollab/domain';

/** Sends password reset emails via the injected EmailSender. */
export class SmtpPasswordResetNotifier implements PasswordResetNotifier {
  constructor(
    private readonly emailSender: EmailSender,
    private readonly subject: string,
    private readonly htmlTemplate: string,
  ) {}

  async sendResetEmail(to: string, rawToken: string): Promise<void> {
    const html = this.htmlTemplate.replace('{token}', rawToken);
    await this.emailSender.send(to, this.subject, html);
  }
}
