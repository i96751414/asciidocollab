import pino from 'pino';
import type { EmailSender } from '@asciidocollab/domain';

const logger = pino({ level: 'info' });

/**
 * Stub email sender that logs messages to the console.
 *
 * Replace with a real email provider (nodemailer, SendGrid, SES) in production.
 */
export class StubEmailSender implements EmailSender {
  /**
   * Logs the email message to the console.
   *
   * @param to - The recipient email address.
   * @param subject - The email subject line.
   * @param _html - The email body in HTML format (unused in stub).
   */
  async send(to: string, subject: string, _html: string): Promise<void> {
    logger.info({ to, subject }, '[STUB] Email sent');
  }
}
