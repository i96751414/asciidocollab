# Domain Notifier Interfaces for Email Use Cases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move email-sending decisions out of the API layer and into the domain use cases by introducing `PasswordResetNotifier` and `EmailChangeNotifier` interfaces, with SMTP implementations in infrastructure.

**Architecture:** Two new domain service interfaces (`PasswordResetNotifier`, `EmailChangeNotifier`) are injected into `RequestPasswordResetUseCase` and `RequestEmailChangeUseCase` respectively. SMTP implementations in `packages/infrastructure` wrap the existing `EmailSender` and resolve templates. The API layer no longer contains any email-sending logic — it only wires dependencies.

**Tech Stack:** TypeScript, pnpm workspaces, Jest (domain unit tests + API integration tests), Fastify (API), Nodemailer (SMTP infrastructure)

---

## File Map

**Create:**
- `packages/domain/src/services/password-reset-notifier.ts` — `PasswordResetNotifier` interface
- `packages/domain/src/services/email-change-notifier.ts` — `EmailChangeNotifier` interface
- `packages/infrastructure/src/services/smtp-password-reset-notifier.ts` — SMTP impl of `PasswordResetNotifier`
- `packages/infrastructure/src/services/smtp-email-change-notifier.ts` — SMTP impl of `EmailChangeNotifier`
- `packages/domain/tests/use-cases/request-password-reset.test.ts` — new domain unit tests (currently missing)

**Modify:**
- `packages/domain/src/services/index.ts` — re-export new interfaces
- `packages/domain/src/use-cases/request-password-reset.ts` — inject `PasswordResetNotifier`, simplify result to `undefined`
- `packages/domain/src/use-cases/request-email-change.ts` — inject `EmailChangeNotifier`, simplify result to `undefined`
- `packages/domain/src/use-cases/index.ts` — remove `RequestEmailChangeResult` export (type is eliminated)
- `packages/infrastructure/src/services/index.ts` — re-export new impls
- `apps/api/src/config/schema.ts` — add `templates.emailChangeRequest` to convict schema and `Config` interface
- `apps/api/src/index.ts` — add `passwordResetNotifier` / `emailChangeNotifier` to `AppContainer` + `buildServer()`
- `apps/api/src/routes/password-reset-request.ts` — inject notifier, remove email-sending logic
- `apps/api/src/routes/email-change-request.ts` — inject notifier, remove email-sending logic
- `packages/domain/tests/use-cases/request-email-change.test.ts` — add `EmailChangeNotifier` mock
- `apps/api/tests/email-change-smtp-failure.test.ts` — replace `emailSender` override with `emailChangeNotifier`

---

### Task 1: Create the two domain notifier interfaces

**Files:**
- Create: `packages/domain/src/services/password-reset-notifier.ts`
- Create: `packages/domain/src/services/email-change-notifier.ts`
- Modify: `packages/domain/src/services/index.ts`

- [ ] **Step 1: Create `PasswordResetNotifier`**

```typescript
// packages/domain/src/services/password-reset-notifier.ts
/** Notifier for password reset events. */
export interface PasswordResetNotifier {
  /**
   * Sends a password reset email to the user.
   *
   * @param to - Recipient email address.
   * @param rawToken - The unhashed reset token to embed in the link.
   */
  sendResetEmail(to: string, rawToken: string): Promise<void>;
}
```

- [ ] **Step 2: Create `EmailChangeNotifier`**

```typescript
// packages/domain/src/services/email-change-notifier.ts
/** Notifier for email address change events. */
export interface EmailChangeNotifier {
  /**
   * Sends a confirmation email to the new address.
   *
   * @param to - The new (pending) email address.
   * @param rawToken - The unhashed confirmation token to embed in the link.
   */
  sendConfirmationEmail(to: string, rawToken: string): Promise<void>;
}
```

- [ ] **Step 3: Re-export both from the services barrel**

Replace the contents of `packages/domain/src/services/index.ts`:

```typescript
/** @file Barrel re-exports for domain service interfaces. */
export { PasswordHasher } from './password-hasher';
export { BreachChecker } from './breach-checker';
export { EmailSender } from './email-sender';
export { TokenGenerator, PasswordResetTokenData } from './token-generator';
export { CommonPasswordChecker } from './common-password-checker';
export { PasswordResetNotifier } from './password-reset-notifier';
export { EmailChangeNotifier } from './email-change-notifier';
```

- [ ] **Step 4: Commit**

```bash
git add packages/domain/src/services/password-reset-notifier.ts \
        packages/domain/src/services/email-change-notifier.ts \
        packages/domain/src/services/index.ts
git commit -m "feat(domain): add PasswordResetNotifier and EmailChangeNotifier interfaces"
```

---

### Task 2: Write failing domain tests for `RequestPasswordResetUseCase`

**Files:**
- Create: `packages/domain/tests/use-cases/request-password-reset.test.ts`

These tests will fail until Task 3 updates the use case.

- [ ] **Step 1: Create the test file**

```typescript
// packages/domain/tests/use-cases/request-password-reset.test.ts
import { RequestPasswordResetUseCase } from '../../src/use-cases/request-password-reset';
import { User } from '../../src/entities/user';
import { UserId } from '../../src/value-objects/user-id';
import { Email } from '../../src/value-objects/email';
import { Timestamps } from '../../src/value-objects/timestamps';
import { UserRepository } from '../../src/repositories/user.repository';
import { TokenGenerator } from '../../src/services/token-generator';
import { PasswordResetNotifier } from '../../src/services/password-reset-notifier';
import { InMemoryPasswordResetTokenRepository } from '../repositories/in-memory-password-reset-token.repository';

const USER_ID = UserId.create('550e8400-e29b-41d4-a716-446655440000');
const TEST_EMAIL = 'user@example.com';

function createTestUser(): User {
  return new User(
    USER_ID,
    Email.create(TEST_EMAIL),
    'Test User',
    'password-hash',
    [],
    null,
    null,
    new Timestamps(),
  );
}

function makeTokenGenerator(): TokenGenerator {
  return {
    generatePasswordResetToken: jest.fn().mockReturnValue({
      token: 'raw-token',
      hashedToken: 'hashed-token',
      expiresAt: new Date(Date.now() + 3_600_000),
    }),
    hashToken: jest.fn().mockReturnValue('hashed-token'),
  };
}

function makeNotifier(): jest.Mocked<PasswordResetNotifier> {
  return { sendResetEmail: jest.fn().mockResolvedValue(undefined) };
}

describe('RequestPasswordResetUseCase', () => {
  let tokenRepo: InMemoryPasswordResetTokenRepository;
  let userRepo: UserRepository;
  let tokenGenerator: TokenGenerator;
  let notifier: jest.Mocked<PasswordResetNotifier>;

  beforeEach(() => {
    tokenRepo = new InMemoryPasswordResetTokenRepository();
    userRepo = {
      findByEmail: jest.fn().mockResolvedValue(createTestUser()),
      findById: jest.fn(),
      save: jest.fn(),
      hasAny: jest.fn(),
    } as unknown as UserRepository;
    tokenGenerator = makeTokenGenerator();
    notifier = makeNotifier();
  });

  test('known user: saves token and sends reset email', async () => {
    const useCase = new RequestPasswordResetUseCase(userRepo, tokenRepo, tokenGenerator, notifier);
    const result = await useCase.execute(Email.create(TEST_EMAIL));

    expect(result.success).toBe(true);
    const saved = await tokenRepo.findByTokenHash('hashed-token');
    expect(saved).not.toBeNull();
    expect(notifier.sendResetEmail).toHaveBeenCalledWith(TEST_EMAIL, 'raw-token');
  });

  test('unknown user: no token saved, notifier not called', async () => {
    (userRepo.findByEmail as jest.Mock).mockResolvedValue(null);
    const useCase = new RequestPasswordResetUseCase(userRepo, tokenRepo, tokenGenerator, notifier);
    const result = await useCase.execute(Email.create('ghost@example.com'));

    expect(result.success).toBe(true);
    const saved = await tokenRepo.findByTokenHash('hashed-token');
    expect(saved).toBeNull();
    expect(notifier.sendResetEmail).not.toHaveBeenCalled();
  });

  test('SMTP failure: notifier throws, use case still returns success', async () => {
    notifier.sendResetEmail.mockRejectedValue(new Error('SMTP down'));
    const useCase = new RequestPasswordResetUseCase(userRepo, tokenRepo, tokenGenerator, notifier);
    const result = await useCase.execute(Email.create(TEST_EMAIL));

    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd packages/domain && pnpm test -- --testPathPattern="request-password-reset" 2>&1 | tail -20
```

Expected: tests fail because `RequestPasswordResetUseCase` constructor does not yet accept `notifier`.

---

### Task 3: Update `RequestPasswordResetUseCase` to inject notifier

**Files:**
- Modify: `packages/domain/src/use-cases/request-password-reset.ts`
- Modify: `packages/domain/src/use-cases/index.ts`

- [ ] **Step 1: Rewrite the use case**

Replace the entire contents of `packages/domain/src/use-cases/request-password-reset.ts`:

```typescript
import { PasswordResetToken } from '../entities/password-reset-token';
import { PasswordResetTokenId } from '../value-objects/password-reset-token-id';
import { Email } from '../value-objects/email';
import { UserRepository } from '../repositories/user.repository';
import { PasswordResetTokenRepository } from '../repositories/password-reset-token.repository';
import { Result } from '../types/result';
import { randomUUID } from 'crypto';
import { TokenGenerator } from '../services/token-generator';
import { PasswordResetNotifier } from '../services/password-reset-notifier';
import { PASSWORD_RESET_DELAY_MS } from '../constants';

/**
 * Initiates a password reset by generating a token and persisting it,
 * then notifying the user via the injected notifier.
 *
 * If the email does not exist, returns success with no side-effects to
 * prevent enumeration. Applies constant-time delay to prevent timing attacks.
 */
export class RequestPasswordResetUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: PasswordResetTokenRepository,
    private readonly tokenGenerator: TokenGenerator,
    private readonly notifier: PasswordResetNotifier,
  ) {}

  async execute(email: Email): Promise<Result<undefined, Error>> {
    const startTime = Date.now();

    const user = await this.userRepo.findByEmail(email);
    const resetToken = this.tokenGenerator.generatePasswordResetToken();

    if (user) {
      const tokenEntity = new PasswordResetToken(
        PasswordResetTokenId.create(randomUUID()),
        user.id,
        resetToken.hashedToken,
        resetToken.expiresAt,
        null,
      );
      await this.tokenRepo.save(tokenEntity);

      try {
        await this.notifier.sendResetEmail(email.value, resetToken.token);
      } catch {
        // delivery failure is non-fatal; infrastructure layer logs it
      }
    }

    const elapsed = Date.now() - startTime;
    const remaining = PASSWORD_RESET_DELAY_MS - elapsed;
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    return { success: true, value: undefined };
  }
}
```

- [ ] **Step 2: Remove `RequestPasswordResetResult` export from use-cases barrel**

In `packages/domain/src/use-cases/index.ts`, also remove the `RequestEmailChangeResult` export line (it will be eliminated in Task 4). For now, remove only the password-reset result — there isn't one exported currently, so no change needed to the index for this task. Confirm:

```bash
grep "RequestPasswordResetResult" packages/domain/src/use-cases/index.ts
```

Expected: no output (it was never exported). If it appears, remove that line.

- [ ] **Step 3: Run domain tests — expect all to pass**

```bash
cd packages/domain && pnpm test -- --testPathPattern="request-password-reset" 2>&1 | tail -20
```

Expected:
```
Tests: 3 passed, 3 total
```

- [ ] **Step 4: Run full domain test suite**

```bash
cd packages/domain && pnpm test 2>&1 | tail -10
```

Expected: all 231 tests pass (no regressions).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/use-cases/request-password-reset.ts \
        packages/domain/tests/use-cases/request-password-reset.test.ts
git commit -m "feat(domain): inject PasswordResetNotifier into RequestPasswordResetUseCase"
```

---

### Task 4: Update `RequestEmailChangeUseCase` and its tests

**Files:**
- Modify: `packages/domain/src/use-cases/request-email-change.ts`
- Modify: `packages/domain/src/use-cases/index.ts`
- Modify: `packages/domain/tests/use-cases/request-email-change.test.ts`

- [ ] **Step 1: Add notifier mock to existing domain tests**

Replace the entire contents of `packages/domain/tests/use-cases/request-email-change.test.ts`:

```typescript
// T034: Domain unit tests for RequestEmailChangeUseCase
import { RequestEmailChangeUseCase } from '../../src/use-cases/request-email-change';
import { User } from '../../src/entities/user';
import { UserId } from '../../src/value-objects/user-id';
import { Email } from '../../src/value-objects/email';
import { Timestamps } from '../../src/value-objects/timestamps';
import { EmailChangeToken } from '../../src/entities/email-change-token';
import { EmailChangeTokenId } from '../../src/value-objects/email-change-token-id';
import { InMemoryEmailChangeTokenRepository } from '../repositories/in-memory-email-change-token.repository';
import { UserRepository } from '../../src/repositories/user.repository';
import { TokenGenerator } from '../../src/services/token-generator';
import { EmailChangeNotifier } from '../../src/services/email-change-notifier';

const USER_ID = UserId.create('550e8400-e29b-41d4-a716-446655440000');
const CURRENT_EMAIL = 'user@example.com';

function createTestUser(email = CURRENT_EMAIL): User {
  return new User(
    USER_ID,
    Email.create(email),
    'Test User',
    'password-hash',
    [],
    null,
    null,
    new Timestamps(),
  );
}

function makeTokenGenerator(): TokenGenerator {
  return {
    generatePasswordResetToken: jest.fn().mockReturnValue({
      token: 'raw-token',
      hashedToken: 'hashed-token',
      expiresAt: new Date(Date.now() + 3_600_000),
    }),
    hashToken: jest.fn().mockReturnValue('hashed-token'),
  };
}

function makeNotifier(): jest.Mocked<EmailChangeNotifier> {
  return { sendConfirmationEmail: jest.fn().mockResolvedValue(undefined) };
}

describe('RequestEmailChangeUseCase', () => {
  let tokenRepo: InMemoryEmailChangeTokenRepository;
  let userRepo: UserRepository;
  let tokenGenerator: TokenGenerator;
  let notifier: jest.Mocked<EmailChangeNotifier>;
  let useCase: RequestEmailChangeUseCase;

  beforeEach(() => {
    tokenRepo = new InMemoryEmailChangeTokenRepository();
    const testUser = createTestUser();
    userRepo = {
      findById: jest.fn().mockResolvedValue(testUser),
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      hasAny: jest.fn(),
    } as unknown as UserRepository;
    tokenGenerator = makeTokenGenerator();
    notifier = makeNotifier();
    useCase = new RequestEmailChangeUseCase(userRepo, tokenRepo, tokenGenerator, notifier);
  });

  test('happy path: creates token and sends confirmation email', async () => {
    const result = await useCase.execute(USER_ID, 'new@example.com');
    expect(result.success).toBe(true);
    const active = await tokenRepo.findActiveByUserId(USER_ID);
    expect(active).not.toBeNull();
    expect(active?.pendingEmail).toBe('new@example.com');
    expect(notifier.sendConfirmationEmail).toHaveBeenCalledWith('new@example.com', 'raw-token');
  });

  test('supersedes existing active token and sends new confirmation', async () => {
    const oldToken = new EmailChangeToken(
      EmailChangeTokenId.create('550e8400-e29b-41d4-a716-446655440001'),
      USER_ID,
      'old-hash',
      'old@example.com',
      new Date(Date.now() + 3_600_000),
      null,
    );
    await tokenRepo.save(oldToken);

    const result = await useCase.execute(USER_ID, 'newer@example.com');
    expect(result.success).toBe(true);

    const byOldHash = await tokenRepo.findByTokenHash('old-hash');
    expect(byOldHash).toBeNull();

    const active = await tokenRepo.findActiveByUserId(USER_ID);
    expect(active?.pendingEmail).toBe('newer@example.com');
    expect(notifier.sendConfirmationEmail).toHaveBeenCalledWith('newer@example.com', 'raw-token');
  });

  test('email already registered: returns success, notifier not called (enumeration prevention)', async () => {
    (userRepo.findByEmail as jest.Mock).mockResolvedValue(createTestUser('new@example.com'));
    const result = await useCase.execute(USER_ID, 'new@example.com');
    expect(result.success).toBe(true);
    const active = await tokenRepo.findActiveByUserId(USER_ID);
    expect(active).toBeNull();
    expect(notifier.sendConfirmationEmail).not.toHaveBeenCalled();
  });

  test('newEmail equals current email: returns success, notifier not called (noop)', async () => {
    const result = await useCase.execute(USER_ID, CURRENT_EMAIL);
    expect(result.success).toBe(true);
    const active = await tokenRepo.findActiveByUserId(USER_ID);
    expect(active).toBeNull();
    expect(notifier.sendConfirmationEmail).not.toHaveBeenCalled();
  });

  test('SMTP failure: notifier throws, use case still returns success', async () => {
    notifier.sendConfirmationEmail.mockRejectedValue(new Error('SMTP down'));
    const result = await useCase.execute(USER_ID, 'new@example.com');
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd packages/domain && pnpm test -- --testPathPattern="request-email-change" 2>&1 | tail -20
```

Expected: tests fail because `RequestEmailChangeUseCase` doesn't accept `notifier` yet.

- [ ] **Step 3: Rewrite `RequestEmailChangeUseCase`**

Replace the entire contents of `packages/domain/src/use-cases/request-email-change.ts`:

```typescript
import { EmailChangeToken } from '../entities/email-change-token';
import { EmailChangeTokenId } from '../value-objects/email-change-token-id';
import { UserId } from '../value-objects/user-id';
import { Email } from '../value-objects/email';
import { UserRepository } from '../repositories/user.repository';
import { EmailChangeTokenRepository } from '../repositories/email-change-token.repository';
import { TokenGenerator } from '../services/token-generator';
import { EmailChangeNotifier } from '../services/email-change-notifier';
import { Result } from '../types/result';
import { randomUUID } from 'crypto';

/** Initiates an email address change by issuing a confirmation token and notifying the user. */
export class RequestEmailChangeUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: EmailChangeTokenRepository,
    private readonly tokenGenerator: TokenGenerator,
    private readonly notifier: EmailChangeNotifier,
  ) {}

  async execute(userId: UserId, newEmail: string): Promise<Result<undefined, Error>> {
    const currentUser = await this.userRepo.findById(userId);

    if (currentUser && currentUser.email.value === newEmail) {
      return { success: true, value: undefined };
    }

    // Enumeration prevention — always return success if email is taken
    const existingUser = await this.userRepo.findByEmail(Email.create(newEmail));
    if (existingUser) {
      return { success: true, value: undefined };
    }

    // Supersede any existing active token
    await this.tokenRepo.deleteByUserId(userId);

    const tokenData = this.tokenGenerator.generatePasswordResetToken();
    const token = new EmailChangeToken(
      EmailChangeTokenId.create(randomUUID()),
      userId,
      tokenData.hashedToken,
      newEmail,
      tokenData.expiresAt,
      null,
    );
    await this.tokenRepo.save(token);

    try {
      await this.notifier.sendConfirmationEmail(newEmail, tokenData.token);
    } catch {
      // delivery failure is non-fatal; infrastructure layer logs it
    }

    return { success: true, value: undefined };
  }
}
```

- [ ] **Step 4: Remove `RequestEmailChangeResult` from the use-cases barrel**

In `packages/domain/src/use-cases/index.ts`, remove this line:

```typescript
export type { RequestEmailChangeResult } from './request-email-change';
```

(The type no longer exists in the file.)

- [ ] **Step 5: Run email-change tests — expect all to pass**

```bash
cd packages/domain && pnpm test -- --testPathPattern="request-email-change" 2>&1 | tail -20
```

Expected:
```
Tests: 5 passed, 5 total
```

- [ ] **Step 6: Run full domain test suite**

```bash
cd packages/domain && pnpm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/use-cases/request-email-change.ts \
        packages/domain/src/use-cases/index.ts \
        packages/domain/tests/use-cases/request-email-change.test.ts
git commit -m "feat(domain): inject EmailChangeNotifier into RequestEmailChangeUseCase"
```

---

### Task 5: Create infrastructure SMTP notifier implementations

**Files:**
- Create: `packages/infrastructure/src/services/smtp-password-reset-notifier.ts`
- Create: `packages/infrastructure/src/services/smtp-email-change-notifier.ts`
- Modify: `packages/infrastructure/src/services/index.ts`

- [ ] **Step 1: Create `SmtpPasswordResetNotifier`**

```typescript
// packages/infrastructure/src/services/smtp-password-reset-notifier.ts
import type { EmailSender, PasswordResetNotifier } from '@asciidocollab/domain';

/** Sends password reset emails via the injected EmailSender. */
export class SmtpPasswordResetNotifier implements PasswordResetNotifier {
  constructor(
    private readonly emailSender: EmailSender,
    private readonly subject: string,
    private readonly htmlTemplate: string,
  ) {}

  async sendResetEmail(to: string, rawToken: string): Promise<void> {
    const html = this.htmlTemplate.replace('{token}', rawToken);
    await this.emailSender.send(to, this.subject, html);
  }
}
```

- [ ] **Step 2: Create `SmtpEmailChangeNotifier`**

```typescript
// packages/infrastructure/src/services/smtp-email-change-notifier.ts
import type { EmailSender, EmailChangeNotifier } from '@asciidocollab/domain';

/** Sends email change confirmation emails via the injected EmailSender. */
export class SmtpEmailChangeNotifier implements EmailChangeNotifier {
  constructor(
    private readonly emailSender: EmailSender,
    private readonly subject: string,
    private readonly htmlTemplate: string,
  ) {}

  async sendConfirmationEmail(to: string, rawToken: string): Promise<void> {
    const html = this.htmlTemplate.replace('{token}', rawToken);
    await this.emailSender.send(to, this.subject, html);
  }
}
```

- [ ] **Step 3: Re-export from the infrastructure barrel**

Add two lines to `packages/infrastructure/src/services/index.ts`:

```typescript
export { SmtpPasswordResetNotifier } from './smtp-password-reset-notifier';
export { SmtpEmailChangeNotifier } from './smtp-email-change-notifier';
```

- [ ] **Step 4: Rebuild infrastructure package**

```bash
pnpm --filter @asciidocollab/infrastructure build 2>&1
```

Expected: `$ tsc` with no errors.

- [ ] **Step 5: Run infrastructure tests**

```bash
cd packages/infrastructure && pnpm test 2>&1 | tail -10
```

Expected: 92 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/infrastructure/src/services/smtp-password-reset-notifier.ts \
        packages/infrastructure/src/services/smtp-email-change-notifier.ts \
        packages/infrastructure/src/services/index.ts
git commit -m "feat(infra): add SmtpPasswordResetNotifier and SmtpEmailChangeNotifier"
```

---

### Task 6: Add email change template to config schema

**Files:**
- Modify: `apps/api/src/config/schema.ts`

The email change template is currently hardcoded in the route. This task moves it to config for consistency with the password reset template.

- [ ] **Step 1: Add convict schema entry**

In `apps/api/src/config/schema.ts`, inside `auth.email.templates`, after the `passwordChanged` block, add:

```typescript
emailChangeRequest: {
  subject: {
    doc: 'Subject line for email change confirmation email.',
    format: String,
    default: '[ASCIIDOCOLLAB] Confirm your email address change',
  },
  html: {
    doc: 'HTML body for email change confirmation email. Use {token} and {frontendUrl} placeholders.',
    format: String,
    default: '<p>Click <a href="{frontendUrl}/email-confirm?token={token}">here</a> to confirm your new email address.</p>',
  },
},
```

- [ ] **Step 2: Add `emailChangeRequest` to the `Config` interface**

In the same file, update the `templates` field in the `Config` interface:

```typescript
templates: {
  resetRequest: { subject: string; html: string };
  passwordChanged: { subject: string; html: string };
  emailChangeRequest: { subject: string; html: string };
};
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/config/schema.ts
git commit -m "feat(config): add emailChangeRequest email template"
```

---

### Task 7: Wire notifiers into the API container

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add imports at top of `apps/api/src/index.ts`**

Add to the infrastructure imports block:

```typescript
import {
  // ... existing imports ...
  SmtpPasswordResetNotifier,
  SmtpEmailChangeNotifier,
} from '@asciidocollab/infrastructure';
```

Add to the domain imports block:

```typescript
import {
  // ... existing imports ...
  PasswordResetNotifier,
  EmailChangeNotifier,
} from '@asciidocollab/domain';
```

- [ ] **Step 2: Add notifiers to the `AppContainer` interface**

In the `services` block of `AppContainer`:

```typescript
services: {
  passwordHasher: PasswordHasher;
  breachChecker: BreachChecker;
  commonPasswordChecker: CommonPasswordChecker;
  emailSender: EmailSender;
  tokenGenerator: TokenGenerator;
  sessionEncryption: SessionEncryption;
  prismaSessionStore: PrismaSessionStore;
  passwordResetNotifier: PasswordResetNotifier;
  emailChangeNotifier: EmailChangeNotifier;
};
```

- [ ] **Step 3: Instantiate notifiers in `buildServer()`**

After the `emailSender` construction (inside the `else` branch that builds all services), add:

```typescript
const passwordResetNotifier = new SmtpPasswordResetNotifier(
  emailSender,
  appConfig.auth.email.templates.resetRequest.subject,
  appConfig.auth.email.templates.resetRequest.html.replace('{frontendUrl}', appConfig.api.frontendUrl),
);

const emailChangeNotifier = new SmtpEmailChangeNotifier(
  emailSender,
  appConfig.auth.email.templates.emailChangeRequest.subject,
  appConfig.auth.email.templates.emailChangeRequest.html.replace('{frontendUrl}', appConfig.api.frontendUrl),
);
```

Then add both to the `app.decorate('services', { ... })` call:

```typescript
app.decorate('services', {
  passwordHasher,
  breachChecker,
  commonPasswordChecker,
  emailSender,
  tokenGenerator,
  sessionEncryption,
  prismaSessionStore,
  passwordResetNotifier,
  emailChangeNotifier,
});
```

- [ ] **Step 4: Add notifiers to the Fastify module augmentation**

In the `declare module 'fastify'` block at the bottom of the file, update the `services` field:

```typescript
services: {
  passwordHasher: PasswordHasher;
  breachChecker: BreachChecker;
  commonPasswordChecker: CommonPasswordChecker;
  emailSender: EmailSender;
  tokenGenerator: TokenGenerator;
  sessionEncryption: SessionEncryption;
  prismaSessionStore: PrismaSessionStore | undefined;
  passwordResetNotifier: PasswordResetNotifier;
  emailChangeNotifier: EmailChangeNotifier;
};
```

- [ ] **Step 5: Rebuild domain package (API depends on its dist)**

```bash
pnpm --filter @asciidocollab/domain build 2>&1
```

Expected: `$ tsc` with no errors.

- [ ] **Step 6: Typecheck the API**

```bash
cd apps/api && pnpm typecheck 2>&1
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(api): wire PasswordResetNotifier and EmailChangeNotifier into AppContainer"
```

---

### Task 8: Simplify API routes — remove email-sending logic

**Files:**
- Modify: `apps/api/src/routes/password-reset-request.ts`
- Modify: `apps/api/src/routes/email-change-request.ts`

- [ ] **Step 1: Simplify `password-reset-request.ts`**

Replace the entire file:

```typescript
import type { FastifyInstance } from 'fastify';
import { Email, RequestPasswordResetUseCase } from '@asciidocollab/domain';
import type { RequestPasswordResetDto, AuthSuccessResponseDto } from '@asciidocollab/shared';

export async function passwordResetRequestRoute(app: FastifyInstance): Promise<void> {
  app.post('/auth/password/reset/request', {
    config: {
      rateLimit: {
        max: app.config.auth.passwordReset.rateLimitMax,
        timeWindow: app.config.auth.passwordReset.rateLimitWindow,
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
    },
  }, async (request, reply) => {
    const { email } = request.body as RequestPasswordResetDto;

    const useCase = new RequestPasswordResetUseCase(
      request.server.repos.user,
      request.server.repos.passwordResetToken,
      request.server.services.tokenGenerator,
      request.server.services.passwordResetNotifier,
    );

    await useCase.execute(Email.create(email));

    return reply.status(200).send({ message: 'If the email exists, a reset link has been sent' } satisfies AuthSuccessResponseDto);
  });
}
```

- [ ] **Step 2: Simplify `email-change-request.ts`**

Replace the entire file:

```typescript
import type { FastifyInstance } from 'fastify';
import { UserId, RequestEmailChangeUseCase } from '@asciidocollab/domain';
import '../types/session';
import type { RequestEmailChangeDto, AuthSuccessResponseDto, AuthErrorResponseDto } from '@asciidocollab/shared';

export async function emailChangeRequestRoute(app: FastifyInstance): Promise<void> {
  app.post('/auth/email/change-request', {
    config: {
      rateLimit: {
        max: app.config.auth.passwordReset.rateLimitMax,
        timeWindow: app.config.auth.passwordReset.rateLimitWindow,
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['newEmail'],
        properties: {
          newEmail: { type: 'string', format: 'email' },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.session.userId) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      } satisfies AuthErrorResponseDto);
    }

    const { newEmail } = request.body as RequestEmailChangeDto;

    const useCase = new RequestEmailChangeUseCase(
      request.server.repos.user,
      request.server.repos.emailChangeToken,
      request.server.services.tokenGenerator,
      request.server.services.emailChangeNotifier,
    );

    await useCase.execute(UserId.create(request.session.userId), newEmail);

    return reply.status(200).send({
      message: 'If the address is available, a confirmation link has been sent',
    } satisfies AuthSuccessResponseDto);
  });
}
```

- [ ] **Step 3: Run API typecheck**

```bash
cd apps/api && pnpm typecheck 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/password-reset-request.ts \
        apps/api/src/routes/email-change-request.ts
git commit -m "refactor(api): remove email-sending logic from routes, delegate to use-case notifiers"
```

---

### Task 9: Update the SMTP failure integration test

**Files:**
- Modify: `apps/api/tests/email-change-smtp-failure.test.ts`

The test previously overrode `app.services.emailSender` with a throwing sender. After the refactor, the use case talks to `emailChangeNotifier` directly — override that instead.

- [ ] **Step 1: Update the test**

Replace the entire file:

```typescript
// Test that POST /auth/email/change-request returns 200 even when the notifier throws.
// Covers the case where the token is persisted but delivery fails.
import type { EmailChangeNotifier } from '@asciidocollab/domain';
import { buildServer } from '../src/index';
import { registerRoute } from '../src/routes/register';
import { loginRoute } from '../src/routes/login';
import { emailChangeRequestRoute } from '../src/routes/email-change-request';
import { startTestContainer, stopTestContainer } from '@asciidocollab/testing';
import { setupTestEnvironment } from './helpers/test-environment';

const TEST_EMAIL = 'smtp-failure@example.com';
const TEST_PASSWORD = 'ValidP@ssw0rd123!';

const throwingNotifier: EmailChangeNotifier = {
  async sendConfirmationEmail(): Promise<void> {
    throw new Error('SMTP connection refused');
  },
};

describe('Email Change Request — delivery failure', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testContext: Awaited<ReturnType<typeof startTestContainer>>;
  let sessionCookie = '';

  beforeAll(async () => {
    setupTestEnvironment();

    testContext = await startTestContainer();
    app = await buildServer({ prisma: testContext.client });
    app.services.emailChangeNotifier = throwingNotifier;

    await app.register(registerRoute);
    await app.register(loginRoute);
    await app.register(emailChangeRequestRoute);
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD, displayName: 'SMTP Failure User' },
    });

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const cookie = loginResponse.cookies[0];
    sessionCookie = cookie ? `${cookie.name}=${cookie.value}` : '';
  });

  afterAll(async () => {
    await app.close();
    await stopTestContainer(testContext);
  });

  test('returns 200 even when notifier throws', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/email/change-request',
      headers: { cookie: sessionCookie },
      payload: { newEmail: 'new-address@example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().message).toBeDefined();
  });
});
```

- [ ] **Step 2: Run this test in isolation**

```bash
cd apps/api && pnpm test -- --testPathPattern="email-change-smtp-failure" 2>&1 | tail -20
```

Expected: 1 test passes.

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/email-change-smtp-failure.test.ts
git commit -m "test(api): update SMTP failure test to override emailChangeNotifier"
```

---

### Task 10: Rebuild domain and run all quality gates

- [ ] **Step 1: Rebuild domain**

```bash
pnpm --filter @asciidocollab/domain build 2>&1
```

Expected: `$ tsc` with no errors.

- [ ] **Step 2: Run typecheck across all packages**

```bash
pnpm typecheck 2>&1
```

Expected: `$ tsc --noEmit` with no errors.

- [ ] **Step 3: Run lint**

```bash
pnpm lint 2>&1
```

Expected: `$ eslint .` with no errors.

- [ ] **Step 4: Run full test suite**

```bash
pnpm test 2>&1 | grep -E "(PASS|FAIL|Tests:|Test Suites:)"
```

Expected:
```
packages/domain test: Test Suites: 30 passed, 30 total   ← +1 new suite
packages/domain test: Tests:       234 passed, 234 total  ← +3 new tests
packages/shared test: Test Suites: 2 passed, 2 total
packages/shared test: Tests:       14 passed, 14 total
packages/infrastructure test: Test Suites: 12 passed, 12 total
packages/infrastructure test: Tests:       92 passed, 92 total
apps/api test: Test Suites: 20 passed, 20 total
apps/api test: Tests:       91 passed, 91 total
```

- [ ] **Step 5: Final commit if anything was missed**

If all gates pass and there are uncommitted changes:

```bash
git status
git add -p  # stage selectively
git commit -m "chore: final cleanup after notifier refactor"
```
