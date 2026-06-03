import { PrismaClient } from '@prisma/client';
import { PrismaKeyBindingRepository } from '../../../src/persistence/user/prisma-key-binding.repository';
import { PrismaUserRepository } from '../../../src/persistence/user/prisma-user.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../../helpers/prisma-test-container';
import { createTestUser } from '../../helpers/test-data';

describe('PrismaKeyBindingRepository', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let repo: PrismaKeyBindingRepository;
  let userRepo: PrismaUserRepository;
  let userId: string;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    repo = new PrismaKeyBindingRepository(client);
    userRepo = new PrismaUserRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    await client.userKeyBinding.deleteMany();
    await client.user.deleteMany();

    const user = createTestUser();
    await userRepo.save(user);
    userId = user.id.value;
  });

  it('findAll returns empty array for new user', async () => {
    const bindings = await repo.findAll(userId);
    expect(bindings).toEqual([]);
  });

  it('upsert inserts then returns on next findAll', async () => {
    await repo.upsert(userId, 'file-tree:rename', 'F3');
    const bindings = await repo.findAll(userId);
    expect(bindings).toHaveLength(1);
    expect(bindings[0].action).toBe('file-tree:rename');
    expect(bindings[0].keyCombo).toBe('F3');
  });

  it('second upsert updates existing row', async () => {
    await repo.upsert(userId, 'file-tree:rename', 'F3');
    await repo.upsert(userId, 'file-tree:rename', 'F4');
    const bindings = await repo.findAll(userId);
    expect(bindings).toHaveLength(1);
    expect(bindings[0].keyCombo).toBe('F4');
  });

  it('delete removes row', async () => {
    await repo.upsert(userId, 'file-tree:rename', 'F3');
    await repo.delete(userId, 'file-tree:rename');
    const bindings = await repo.findAll(userId);
    expect(bindings).toHaveLength(0);
  });

  it('cascade delete when user is deleted', async () => {
    await repo.upsert(userId, 'file-tree:rename', 'F3');
    await client.user.delete({ where: { id: userId } });
    // Should not throw - cascade handled by DB
    const bindings = await repo.findAll(userId);
    expect(bindings).toHaveLength(0);
  });
});
