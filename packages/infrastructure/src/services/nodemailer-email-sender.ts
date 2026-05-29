import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import pino from 'pino';
import type { EmailSender } from '@asciidocollab/domain';

const logger = pino({ level: 'info' });

/**
 * Configuration for the Nodemailer email sender.
 */
export interface NodemailerEmailSenderConfig {
  /** Enable or disable email sending. */
  enabled: boolean;
  /** SMTP server host. */
  host: string;
  /** SMTP server port. */
  port: number;
  /** SMTP authentication user. */
  user: string;
  /** SMTP authentication password. */
  password: string;
  /** Sender email address. */
  from: string | null;
}

/**
 * SMTP-based email sender implementation using nodemailer.
 *
 * Sends transactional emails via SMTP. Supports enabling/disabling
 * email sending via configuration.
 */
export class NodemailerEmailSender implements EmailSender {
  private transporter: Transporter | null = null;
  private readonly config: NodemailerEmailSenderConfig;

  /**
   * @param config - SMTP configuration.
   */
  constructor(config: NodemailerEmailSenderConfig) {
    this.config = config;
    this.validateConfig();
    this.initializeTransporter();
  }

  /**
   * Validates the configuration.
   */
  private validateConfig(): void {
    if (this.config.enabled && !this.config.from) {
      throw new Error('Email sender "from" address is required when email is enabled');
    }
  }

  /**
   * Initializes the nodemailer transporter.
   *
   * @throws {Error} If transporter creation fails.
   */
  private initializeTransporter(): void {
    if (!this.config.enabled) {
      logger.info('Email sending is disabled');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.port === 465,
      auth: {
        user: this.config.user,
        pass: this.config.password,
      },
    });
    logger.info({ host: this.config.host, port: this.config.port }, 'SMTP transporter initialized');
  }

  /**
   * Sends an email message via SMTP.
   *
   * @param to - The recipient email address.
   * @param subject - The email subject line.
   * @param html - The email body in HTML format.
   * @returns A promise that resolves when the email is sent.
   * @throws {Error} If email sending is disabled or transporter is not available.
   */
  async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.config.enabled) {
      logger.debug({ to, subject }, 'Email sending disabled, skipping');
      return;
    }

    if (!this.transporter) {
      throw new Error('SMTP transporter not initialized');
    }

    try {
      await this.transporter.sendMail({
        from: this.config.from as string,
        to,
        subject,
        html,
      });
      logger.info({ to, subject }, 'Email sent successfully');
    } catch (error) {
      logger.error({ to, subject, error }, 'Failed to send email');
      throw error;
    }
  }
}
