import type { EmailSender, EmailVerificationNotifier, Email } from '@asciidocollab/domain';

/** SMTP-backed implementation of the `EmailVerificationNotifier` interface. */
export class SmtpEmailVerificationNotifier implements EmailVerificationNotifier {
  /** Creates a new SmtpEmailVerificationNotifier with its email templates. */
  constructor(
    private readonly emailSender: EmailSender,
    private readonly verifySubject: string,
    private readonly verifyHtmlTemplate: string,
    private readonly resendSubject: string,
    private readonly resendHtmlTemplate: string,
  ) {}

  /** Sends the initial verification email with a token-embedded link. */
  async sendVerificationEmail(recipientEmail: Email, rawToken: string): Promise<void> {
    const html = this.verifyHtmlTemplate.replaceAll('{token}', rawToken);
    await this.emailSender.send(recipientEmail.value, this.verifySubject, html);
  }

  /** Sends a resend-verification email with a fresh token-embedded link. */
  async sendResendVerificationEmail(recipientEmail: Email, rawToken: string): Promise<void> {
    const html = this.resendHtmlTemplate.replaceAll('{token}', rawToken);
    await this.emailSender.send(recipientEmail.value, this.resendSubject, html);
  }
}
