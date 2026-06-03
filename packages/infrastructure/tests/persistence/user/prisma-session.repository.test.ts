import { PrismaClient } from '@prisma/client';
import { PrismaSessionRepository } from '../../src/persistence/prisma-session.repository';
import { PrismaUserRepository } from '../../src/persistence/prisma-user.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../helpers/prisma-test-container';
import { createTestUser } from '../helpers/test-data';
import { UserId } from '@asciidocollab/domain';
import { randomUUID } from 'crypto';

describe('PrismaSessionRepository', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let repo: PrismaSessionRepository;
  let userRepo: PrismaUserRepository;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    repo = new PrismaSessionRepository(client);
    userRepo = new PrismaUserRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    await client.session.deleteMany();
    await client.user.deleteMany();
  });

  it('deleteByUserId removes all sessions for that user', async () => {
    const user = createTestUser();
    await userRepo.save(user);

    await client.session.createMany({
      data: [
        {
          id: randomUUID(),
          userId: user.id.value,
          sid: `sid-${randomUUID()}`,
          data: {},
          expiresAt: new Date(Date.now() + 3_600_000),
        },
        {
          id: randomUUID(),
          userId: user.id.value,
          sid: `sid-${randomUUID()}`,
          data: {},
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      ],
    });

    await repo.deleteByUserId(user.id);

    const remaining = await client.session.findMany({ where: { userId: user.id.value } });
    expect(remaining).toHaveLength(0);
  });

  it('deleteByUserId is a no-op when no sessions exist', async () => {
    const randomId = UserId.create(randomUUID());
    await expect(repo.deleteByUserId(randomId)).resolves.not.toThrow();
  });
});
