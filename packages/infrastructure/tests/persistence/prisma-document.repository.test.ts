import { DocumentRepository, UserRepository, ProjectRepository, FileNodeRepository, DocumentId, FilePath, FileNode, FileNodeType } from '@asciidocollab/domain';
import { PrismaClient } from '@prisma/client';
import { PrismaDocumentRepository } from '../../src/persistence/prisma-document.repository';
import { PrismaUserRepository } from '../../src/persistence/prisma-user.repository';
import { PrismaProjectRepository } from '../../src/persistence/prisma-project.repository';
import { PrismaFileNodeRepository } from '../../src/persistence/prisma-file-node.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../helpers/prisma-test-container';
import { createTestUser, createTestProject, createTestFileNode, createTestDocument } from '../helpers/test-data';

describe('PrismaDocumentRepository', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let repo: DocumentRepository;
  let userRepo: UserRepository;
  let projectRepo: ProjectRepository;
  let fileNodeRepo: FileNodeRepository;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    repo = new PrismaDocumentRepository(client);
    userRepo = new PrismaUserRepository(client);
    projectRepo = new PrismaProjectRepository(client);
    fileNodeRepo = new PrismaFileNodeRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    await client.document.deleteMany();
    await client.fileNode.deleteMany();
    await client.project.deleteMany();
    await client.user.deleteMany();
  });

  it('should save and find a document by id', async () => {
    const fileNode = await setupFileNode();
    const document = createTestDocument(fileNode.id);
    await repo.save(document);

    const found = await repo.findById(document.id);
    expect(found).not.toBeNull();
    expect(found!.id.value).toBe(document.id.value);
  });

  it('should return null when finding by non-existent id', async () => {
    const result = await repo.findById(DocumentId.create('00000000-0000-4000-8000-000000000001'));
    expect(result).toBeNull();
  });

  it('should find a document by file node id', async () => {
    const fileNode = await setupFileNode();
    const document = createTestDocument(fileNode.id);
    await repo.save(document);

    const found = await repo.findByFileNodeId(fileNode.id);
    expect(found).not.toBeNull();
    expect(found!.id.value).toBe(document.id.value);
  });

  it('should find documents by multiple file node ids', async () => {
    const function1 = await setupFileNode('doc1.adoc');
    const function2 = await setupFileNode('doc2.adoc');
    const document1 = createTestDocument(function1.id);
    const document2 = createTestDocument(function2.id);
    await repo.save(document1);
    await repo.save(document2);

    const found = await repo.findByFileNodeIds([function1.id, function2.id]);
    expect(found).toHaveLength(2);
  });

  it('should delete a document', async () => {
    const fileNode = await setupFileNode();
    const document = createTestDocument(fileNode.id);
    await repo.save(document);
    await repo.delete(document.id);
    const found = await repo.findById(document.id);
    expect(found).toBeNull();
  });

  async function setupFileNode(name = 'test.adoc'): Promise<FileNode> {
    const owner = createTestUser();
    await userRepo.save(owner);
    const project = createTestProject();
    await projectRepo.save(project);
    const folder = createTestFileNode(project.id, { type: FileNodeType.create('folder'), path: FilePath.create('/docs') });
    await fileNodeRepo.save(folder);
    const node = createTestFileNode(project.id, { parentId: folder.id, name, path: FilePath.create(`/docs/${name}`) });
    await fileNodeRepo.save(node);
    return node;
  }
});
