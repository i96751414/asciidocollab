import { PrismaClient } from '@prisma/client';
import { PrismaSystemSettingRepository } from '../../src/persistence/prisma-system-setting.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../helpers/prisma-test-container';

describe('PrismaSystemSettingRepository', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let repo: PrismaSystemSettingRepository;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    repo = new PrismaSystemSettingRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    await client.systemSetting.deleteMany();
  });

  it('returns null when key absent', async () => {
    const result = await repo.get('nonexistent');
    expect(result).toBeNull();
  });

  it('set creates a new setting', async () => {
    await repo.set('openRegistration', 'true');
    const result = await repo.get('openRegistration');
    expect(result).toBe('true');
  });

  it('set updates an existing setting (upsert)', async () => {
    await repo.set('openRegistration', 'true');
    await repo.set('openRegistration', 'false');
    const result = await repo.get('openRegistration');
    expect(result).toBe('false');
  });

  it('persists different keys independently', async () => {
    await repo.set('keyA', 'valueA');
    await repo.set('keyB', 'valueB');
    expect(await repo.get('keyA')).toBe('valueA');
    expect(await repo.get('keyB')).toBe('valueB');
  });
});
