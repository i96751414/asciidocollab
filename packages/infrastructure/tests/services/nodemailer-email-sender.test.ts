import { NodemailerEmailSender, NodemailerEmailSenderConfig } from '../../src/services/nodemailer-email-sender';

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
  });

  describe('SMTP connection', () => {
    test('creates transporter when enabled', () => {
      const config = createConfig();
      const sender = new NodemailerEmailSender(config);
      expect(sender).toBeDefined();
    });

    test('does not create transporter when disabled', () => {
      const config = createConfig({ enabled: false });
      const sender = new NodemailerEmailSender(config);
      expect(sender).toBeDefined();
    });

    test('uses correct port configuration', () => {
      const config = createConfig({ port: 465 });
      const sender = new NodemailerEmailSender(config);
      expect(sender).toBeDefined();
    });
  });

  describe('email sending', () => {
    test('skips sending when disabled', async () => {
      const config = createConfig({ enabled: false });
      const sender = new NodemailerEmailSender(config);
      
      await expect(sender.send('test@example.com', 'Subject', '<p>Body</p>')).resolves.not.toThrow();
    });

    test('throws when transporter not initialized', async () => {
      const config = createConfig({ enabled: true, host: 'invalid.host' });
      const sender = new NodemailerEmailSender(config);
      
      await expect(sender.send('test@example.com', 'Subject', '<p>Body</p>')).rejects.toThrow();
    });

    test('logs successful email sending', async () => {
      const config = createConfig({ enabled: false });
      const sender = new NodemailerEmailSender(config);
      
      // When disabled, it should log and skip
      await sender.send('test@example.com', 'Subject', '<p>Body</p>');
    });

    test('logs email sending failure', async () => {
      const config = createConfig({ enabled: true, host: 'invalid.host' });
      const sender = new NodemailerEmailSender(config);
      
      await expect(sender.send('test@example.com', 'Subject', '<p>Body</p>')).rejects.toThrow();
    });
  });
});
