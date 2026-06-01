import type { EmailSender, RegistrationInvitationNotifier, Email } from '@asciidocollab/domain';

/** SMTP-backed implementation of the `RegistrationInvitationNotifier` interface. */
export class SmtpRegistrationInvitationNotifier implements RegistrationInvitationNotifier {
  /** Creates a new SmtpRegistrationInvitationNotifier with its email template. */
  constructor(
    private readonly emailSender: EmailSender,
    private readonly subject: string,
    private readonly htmlTemplate: string,
  ) {}

  /** Sends the invitation email with the token and inviter name interpolated. */
  async sendInvitation(recipientEmail: Email, rawToken: string, invitedBy: string): Promise<void> {
    const html = this.htmlTemplate
      .replaceAll('{token}', rawToken)
      .replaceAll('{invitedBy}', invitedBy);
    await this.emailSender.send(recipientEmail.value, this.subject, html);
  }
}
