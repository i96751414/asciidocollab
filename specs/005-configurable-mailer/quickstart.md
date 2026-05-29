# Quickstart: Configurable Email Sender

**Feature**: 005-configurable-mailer
**Date**: 2026-05-28

## Prerequisites

- Node.js 18+
- pnpm
- SMTP server (for production) or Mailhog/Mailtrap (for development)

## Environment Variables

### Required (for email enabled)

```bash
ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED=true
ASCIIDOCOLLAB_AUTH_SMTP_HOST=smtp.example.com
ASCIIDOCOLLAB_AUTH_SMTP_PORT=587
ASCIIDOCOLLAB_AUTH_SMTP_USER=your-user
ASCIIDOCOLLAB_AUTH_SMTP_PASSWORD=your-password
ASCIIDOCOLLAB_AUTH_EMAIL_FROM=noreply@example.com
```

### Development (email disabled)

```bash
ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED=false
```

## Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Configure environment variables (see above)

3. Start the server:
   ```bash
   pnpm --filter=@asciidocollab/api dev
   ```

## Testing

### Run all tests
```bash
pnpm test
```

### Run infrastructure tests only
```bash
pnpm --filter=@asciidocollab/infrastructure test
```

### Run API tests only
```bash
pnpm --filter=@asciidocollab/api test
```

## Verification

### Email Disabled
1. Set `ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED=false`
2. Register a new user → Account created, no email sent
3. Request password reset → Token generated, no email sent

### Email Enabled
1. Set `ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED=true` with valid SMTP config
2. Register a new user → Account created, breach alert sent (if breached)
3. Request password reset → Reset email sent

### Breach Check
1. Try to register with a breached password (e.g., "password123")
2. Registration should be rejected with error message
3. This works regardless of email enabled/disabled state

## Troubleshooting

### Email not sending
- Check SMTP configuration
- Verify `ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED=true`
- Check server logs for SMTP connection errors

### Registration blocked unexpectedly
- Password may be in breach database
- Check HIBP API connectivity
- Verify breach check is working independently of email config
