import { request } from '@playwright/test';

const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

interface MailpitMessage {
  ID: string;
  To: Array<{ Address: string }>;
}

interface MailpitMessageDetail {
  HTML: string;
  Text: string;
}

export async function clearMailpit(): Promise<void> {
  const context = await request.newContext();
  try {
    await context.delete(`${MAILPIT_URL}/api/v1/messages`);
  } finally {
    await context.dispose();
  }
}

export async function waitForEmail(toAddress: string, timeoutMs = 15_000): Promise<MailpitMessageDetail> {
  const context = await request.newContext();
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const resp = await context.get(`${MAILPIT_URL}/api/v1/messages`);
      const body = await resp.json() as { messages?: MailpitMessage[] };
      const message = (body.messages ?? []).find(
        (m) => m.To?.some((t) => t.Address === toAddress),
      );
      if (message) {
        const detail = await context.get(`${MAILPIT_URL}/api/v1/message/${message.ID}`);
        return await detail.json() as MailpitMessageDetail;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`No email to ${toAddress} arrived within ${timeoutMs}ms`);
  } finally {
    await context.dispose();
  }
}

export function extractVerificationToken(html: string): string {
  const match = html.match(/verify-email\?token=([^"&\s<]+)/);
  if (!match) throw new Error(`No verification token found in email HTML`);
  return match[1];
}

export function extractInvitationToken(html: string): string {
  const match = html.match(/accept-invite\?token=([^"&\s<]+)/);
  if (!match) throw new Error(`No invitation token found in email HTML`);
  return match[1];
}
