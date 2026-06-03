import { PrismaClient } from '@prisma/client';
import { EmailVerificationToken, EmailVerificationTokenId, UserId } from '@asciidocollab/domain';
import { PrismaEmailVerificationTokenRepository } from '../../../src/persistence/auth-tokens/prisma-email-verification-token.repository';
import { PrismaUserRepository } from '../../../src/persistence/user/prisma-user.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../../helpers/prisma-test-container';
import { createTestUser } from '../../helpers/test-data';
import { randomUUID } from 'crypto';

function makeToken(userId: UserId, tokenHash?: string): EmailVerificationToken {
  return new EmailVerificationToken(
    EmailVerificationTokenId.create(randomUUID()),
    userId,
    tokenHash ?? `hash-${randomUUID()}`,
    new Date(Date.now() + 86_400_000),
    null,
    new Date(),
  );
}

describe('PrismaEmailVerificationTokenRepository', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let repo: PrismaEmailVerificationTokenRepository;
  let userRepo: PrismaUserRepository;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    repo = new PrismaEmailVerificationTokenRepository(client);
    userRepo = new PrismaUserRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    await client.emailVerificationToken.deleteMany();
    await client.user.deleteMany();
  });

  it('saves and finds by tokenHash', async () => {
    const user = createTestUser();
    await userRepo.save(user);
    const token = makeToken(user.id, 'specific-hash');
    await repo.save(token);

    const found = await repo.findByTokenHash('specific-hash');
    expect(found).not.toBeNull();
    expect(found?.userId.value).toBe(user.id.value);
    expect(found?.usedAt).toBeNull();
  });

  it('returns null when tokenHash not found', async () => {
    const result = await repo.findByTokenHash('nonexistent');
    expect(result).toBeNull();
  });

  it('deleteByUserId removes all tokens for that user', async () => {
    const user = createTestUser();
    await userRepo.save(user);
    await repo.save(makeToken(user.id));
    await repo.save(makeToken(user.id));

    await repo.deleteByUserId(user.id);

    const records = await client.emailVerificationToken.findMany({ where: { userId: user.id.value } });
    expect(records).toHaveLength(0);
  });

  it('upsert updates token (mark as used)', async () => {
    const user = createTestUser();
    await userRepo.save(user);
    const token = makeToken(user.id, 'used-hash');
    await repo.save(token);

    const usedToken = new EmailVerificationToken(
      token.id,
      token.userId,
      token.tokenHash,
      token.expiresAt,
      new Date(),
      token.createdAt,
    );
    await repo.save(usedToken);

    const found = await repo.findByTokenHash('used-hash');
    expect(found?.usedAt).not.toBeNull();
  });
});
