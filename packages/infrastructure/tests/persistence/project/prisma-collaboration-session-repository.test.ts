import { PrismaClient } from '@prisma/client';
import { ProjectId, DocumentId, FilePath, FileNodeType } from '@asciidocollab/domain';
import { PrismaCollaborationSessionRepository } from '../../../src/persistence/project/prisma-collaboration-session-repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../../helpers/prisma-test-container';
import { createTestUser, createTestProject, createTestFileNode, createTestDocument } from '../../helpers/test-data';
import { PrismaUserRepository } from '../../../src/persistence/user/prisma-user.repository';
import { PrismaProjectRepository } from '../../../src/persistence/project/prisma-project.repository';
import { PrismaFileNodeRepository } from '../../../src/persistence/file-tree/prisma-file-node.repository';
import { PrismaDocumentRepository } from '../../../src/persistence/file-tree/prisma-document.repository';

describe('PrismaCollaborationSessionRepository', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let repo: PrismaCollaborationSessionRepository;
  let projectId: ProjectId;
  let documentId: DocumentId;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    repo = new PrismaCollaborationSessionRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    await client.collaborationSession.deleteMany();
    await client.document.deleteMany();
    await client.fileNode.deleteMany();
    await client.project.deleteMany();
    await client.user.deleteMany();

    const userRepo = new PrismaUserRepository(client);
    const projectRepo = new PrismaProjectRepository(client);
    const fileNodeRepo = new PrismaFileNodeRepository(client);
    const documentRepo = new PrismaDocumentRepository(client);

    const user = createTestUser();
    await userRepo.save(user);

    const project = createTestProject();
    await projectRepo.save(project);
    projectId = project.id;

    const folderNode = createTestFileNode(project.id, {
      type: FileNodeType.create('folder'),
      path: FilePath.create('/docs'),
    });
    await fileNodeRepo.save(folderNode);

    const fileNode = createTestFileNode(project.id, {
      parentId: folderNode.id,
      path: FilePath.create('/docs/test.adoc'),
    });
    await fileNodeRepo.save(fileNode);

    const document = createTestDocument(fileNode.id);
    await documentRepo.save(document);
    documentId = document.id;
  });

  it('open creates a session record', async () => {
    expect(await repo.isActive(projectId, documentId)).toBe(false);
    await repo.open(projectId, documentId);
    expect(await repo.isActive(projectId, documentId)).toBe(true);
  });

  it('open is idempotent (upsert)', async () => {
    await repo.open(projectId, documentId);
    await expect(repo.open(projectId, documentId)).resolves.not.toThrow();
    expect(await repo.isActive(projectId, documentId)).toBe(true);
  });

  it('close removes the session record', async () => {
    await repo.open(projectId, documentId);
    await repo.close(projectId, documentId);
    expect(await repo.isActive(projectId, documentId)).toBe(false);
  });

  it('close is a no-op when record does not exist', async () => {
    await expect(repo.close(projectId, documentId)).resolves.not.toThrow();
    expect(await repo.isActive(projectId, documentId)).toBe(false);
  });

  it('closeAll removes all session records', async () => {
    await repo.open(projectId, documentId);
    await repo.closeAll();
    expect(await repo.isActive(projectId, documentId)).toBe(false);
  });
});
