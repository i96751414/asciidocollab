import type { EmailSender, EmailChangeNotifier } from '@asciidocollab/domain';

/** Sends email change confirmation emails via the injected EmailSender. */
export class SmtpEmailChangeNotifier implements EmailChangeNotifier {
  constructor(
    private readonly emailSender: EmailSender,
    private readonly subject: string,
    private readonly htmlTemplate: string,
  ) {}

  async sendConfirmationEmail(to: string, rawToken: string): Promise<void> {
    const html = this.htmlTemplate.replace('{token}', rawToken);
    await this.emailSender.send(to, this.subject, html);
  }
}
