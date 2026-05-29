import { NodemailerEmailSender, NodemailerEmailSenderConfig } from '../../src/services/nodemailer-email-sender';

// Mock nodemailer to verify transporter creation and send calls
jest.mock('nodemailer', () => {
  const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-message-id' });
  const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail });
  return {
    __esModule: true,
    default: {
      createTransport: mockCreateTransport,
    },
    createTransport: mockCreateTransport,
  };
});

function createConfig(overrides: Partial<NodemailerEmailSenderConfig> = {}): NodemailerEmailSenderConfig {
  return {
    enabled: true,
    host: 'smtp.example.com',
    port: 587,
    user: 'test@example.com',
    password: 'password',
    from: 'sender@example.com',
    ...overrides,
  };
}

describe('NodemailerEmailSender', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('configuration validation', () => {
    test('throws when enabled but from is empty', () => {
      const config = createConfig({ enabled: true, from: '' });
      expect(() => new NodemailerEmailSender(config)).toThrow('Email sender "from" address is required when email is enabled');
    });

    test('throws when enabled but from is null', () => {
      const config = createConfig({ enabled: true, from: null });
      expect(() => new NodemailerEmailSender(config)).toThrow('Email sender "from" address is required when email is enabled');
    });

    test('does not throw when disabled and from is empty', () => {
      const config = createConfig({ enabled: false, from: '' });
      expect(() => new NodemailerEmailSender(config)).not.toThrow();
    });

    test('does not throw when disabled and from is null', () => {
      const config = createConfig({ enabled: false, from: null });
      expect(() => new NodemailerEmailSender(config)).not.toThrow();
    });
  });

  describe('SMTP connection', () => {
    test('creates transporter with correct options when enabled', () => {
      const nodemailer = jest.requireMock('nodemailer');
      const config = createConfig();
      new NodemailerEmailSender(config);

      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test@example.com',
          pass: 'password',
        },
      });
    });

    test('does not create transporter when disabled', () => {
      const nodemailer = jest.requireMock('nodemailer');
      const config = createConfig({ enabled: false });
      new NodemailerEmailSender(config);

      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });

    test('uses secure connection for port 465', () => {
      const nodemailer = jest.requireMock('nodemailer');
      const config = createConfig({ port: 465 });
      new NodemailerEmailSender(config);

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ secure: true }),
      );
    });

    test('uses non-secure connection for port 587', () => {
      const nodemailer = jest.requireMock('nodemailer');
      const config = createConfig({ port: 587 });
      new NodemailerEmailSender(config);

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ secure: false }),
      );
    });
  });

  describe('email sending', () => {
    test('skips sending without calling transporter when disabled', async () => {
      const nodemailer = jest.requireMock('nodemailer');
      const config = createConfig({ enabled: false });
      const sender = new NodemailerEmailSender(config);

      await sender.send('test@example.com', 'Subject', '<p>Body</p>');

      // Transporter was never created, so sendMail should not exist
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });

    test('calls sendMail with correct parameters', async () => {
      const nodemailer = jest.requireMock('nodemailer');
      const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
      nodemailer.createTransport.mockReturnValue({ sendMail: mockSendMail });

      const config = createConfig();
      const sender = new NodemailerEmailSender(config);

      await sender.send('recipient@example.com', 'Test Subject', '<p>Test Body</p>');

      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test Body</p>',
      });
    });

    test('propagates sendMail errors', async () => {
      const nodemailer = jest.requireMock('nodemailer');
      const mockSendMail = jest.fn().mockRejectedValue(new Error('SMTP connection failed'));
      nodemailer.createTransport.mockReturnValue({ sendMail: mockSendMail });

      const config = createConfig();
      const sender = new NodemailerEmailSender(config);

      await expect(sender.send('test@example.com', 'Subject', '<p>Body</p>'))
        .rejects.toThrow('SMTP connection failed');
    });
  });
});
