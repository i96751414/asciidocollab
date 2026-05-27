import { TemplateRepository } from '@asciidocollab/domain';
import { PrismaClient } from '@prisma/client';
import { PrismaTemplateRepository } from '../../src/persistence/prisma-template.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../helpers/prisma-test-container';
import { createTestTemplate } from '../helpers/test-data';
import { TemplateId } from '@asciidocollab/domain';

describe('PrismaTemplateRepository', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let repo: TemplateRepository;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    repo = new PrismaTemplateRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    await client.template.deleteMany();
  });

  it('should save and find a template by id', async () => {
    const template = createTestTemplate();
    await repo.save(template);
    const found = await repo.findById(template.id);
    expect(found).not.toBeNull();
    expect(found!.id.value).toBe(template.id.value);
    expect(found!.name).toBe(template.name);
  });

  it('should return null when finding by non-existent id', async () => {
    const result = await repo.findById(TemplateId.create('00000000-0000-4000-8000-000000000001'));
    expect(result).toBeNull();
  });

  it('should delete a template', async () => {
    const template = createTestTemplate();
    await repo.save(template);
    await repo.delete(template.id);
    const found = await repo.findById(template.id);
    expect(found).toBeNull();
  });

  it('should find all templates', async () => {
    const t1 = createTestTemplate({ name: 'Template 1' });
    const t2 = createTestTemplate({ name: 'Template 2' });
    await repo.save(t1);
    await repo.save(t2);

    const all = await repo.findAll();
    expect(all).toHaveLength(2);
  });

  it('should handle nullable sourceProjectId', async () => {
    const template = createTestTemplate({ sourceProjectId: null });
    await repo.save(template);
    const found = await repo.findById(template.id);
    expect(found).not.toBeNull();
    expect(found!.sourceProjectId).toBeNull();
  });
});
