import pino from 'pino';

const logger = pino({ level: 'info' });

/**
 * Email message data for the email dispatch service.
 */
export interface EmailMessage {
  /** Recipient email address. */
  to: string;
  /** Email subject line. */
  subject: string;
  /** Email body in HTML format. */
  html: string;
}

/**
 * Sends an email message. Currently a stub that logs to console.
 * Should be replaced with a real email provider (nodemailer, SendGrid, SES).
 *
 * @param message - The email message to send.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  logger.info({ to: message.to, subject: message.subject }, 'Email sent');
}
