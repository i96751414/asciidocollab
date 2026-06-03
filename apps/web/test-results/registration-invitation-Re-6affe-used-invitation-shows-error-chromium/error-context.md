# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: registration-invitation.spec.ts >> Registration via invitation (US1) >> already-used invitation shows error
- Location: e2e/registration-invitation.spec.ts:63:7

# Error details

```
Error: No email to used-invite-1780338832169@example.com arrived within 15000ms
```

# Test source

```ts
  1  | import { request } from '@playwright/test';
  2  | 
  3  | const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';
  4  | 
  5  | interface MailpitMessage {
  6  |   ID: string;
  7  |   To: Array<{ Address: string }>;
  8  | }
  9  | 
  10 | interface MailpitMessageDetail {
  11 |   HTML: string;
  12 |   Text: string;
  13 | }
  14 | 
  15 | export async function clearMailpit(): Promise<void> {
  16 |   const context = await request.newContext();
  17 |   try {
  18 |     await context.delete(`${MAILPIT_URL}/api/v1/messages`);
  19 |   } finally {
  20 |     await context.dispose();
  21 |   }
  22 | }
  23 | 
  24 | export async function waitForEmail(toAddress: string, timeoutMs = 15_000): Promise<MailpitMessageDetail> {
  25 |   const context = await request.newContext();
  26 |   const deadline = Date.now() + timeoutMs;
  27 |   try {
  28 |     while (Date.now() < deadline) {
  29 |       const resp = await context.get(`${MAILPIT_URL}/api/v1/messages`);
  30 |       const body = await resp.json() as { messages?: MailpitMessage[] };
  31 |       const message = (body.messages ?? []).find(
  32 |         (m) => m.To?.some((t) => t.Address === toAddress),
  33 |       );
  34 |       if (message) {
  35 |         const detail = await context.get(`${MAILPIT_URL}/api/v1/message/${message.ID}`);
  36 |         return await detail.json() as MailpitMessageDetail;
  37 |       }
  38 |       await new Promise<void>((resolve) => setTimeout(resolve, 500));
  39 |     }
> 40 |     throw new Error(`No email to ${toAddress} arrived within ${timeoutMs}ms`);
     |           ^ Error: No email to used-invite-1780338832169@example.com arrived within 15000ms
  41 |   } finally {
  42 |     await context.dispose();
  43 |   }
  44 | }
  45 | 
  46 | export function extractVerificationToken(html: string): string {
  47 |   const match = html.match(/verify-email\?token=([^"&\s<]+)/);
  48 |   if (!match) throw new Error(`No verification token found in email HTML`);
  49 |   return match[1];
  50 | }
  51 | 
  52 | export function extractInvitationToken(html: string): string {
  53 |   const match = html.match(/accept-invite\?token=([^"&\s<]+)/);
  54 |   if (!match) throw new Error(`No invitation token found in email HTML`);
  55 |   return match[1];
  56 | }
  57 | 
```