/**
 * Cross-use-case regression: all three download/content paths must skip the collaborative reader
 * when the collaboration session is NOT active (dormant document). This guards against any one path
 * accidentally calling the reader without an active-session gate.
 */
import { GetFileNodeContentUseCase } from '../../../src/use-cases/content/get-file-node-content';
import { DownloadFileUseCase } from '../../../src/use-cases/project/download-file';
import { DownloadProjectUseCase } from '../../../src/use-cases/project/download-project';
import { InMemoryProjectRepository } from '../../ports/project/in-memory-project.repository';
import { InMemoryFileNodeRepository } from '../../ports/file-tree/in-memory-file-node.repository';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryDocumentRepository } from '../../ports/file-tree/in-memory-document.repository';
import { InMemoryAssetRepository } from '../../ports/file-tree/in-memory-asset.repository';
import { InMemoryProjectFileStore } from '../../ports/storage/in-memory-project-file-store';
import { InMemoryCollaborationSessionRepository } from '../../ports/project/in-memory-collaboration-session-repository';
import { Project } from '../../../src/entities/project';
import { FileNode } from '../../../src/entities/file-node';
import { Document } from '../../../src/entities/document';
import { ProjectMember } from '../../../src/entities/project-member';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { ProjectName } from '../../../src/value-objects/project/project-name';
import { FileNodeId } from '../../../src/value-objects/ids/file-node-id';
import { DocumentId } from '../../../src/value-objects/ids/document-id';
import { ContentId } from '../../../src/value-objects/ids/content-id';
import { YjsStateId } from '../../../src/value-objects/ids/yjs-state-id';
import { FileNodeType } from '../../../src/value-objects/files/file-node-type';
import { FilePath } from '../../../src/value-objects/files/file-path';
import { MimeType } from '../../../src/value-objects/files/mime-type';
import { UserId } from '../../../src/value-objects/ids/user-id';
import { Role } from '../../../src/value-objects/identity/role';
import type { CollaborativeContentReader } from '../../../src/ports/storage/collaborative-content-reader';

const PROJECT_ID   = '550e8400-e29b-41d4-a716-aa0000000001';
const MEMBER_ID    = '550e8400-e29b-41d4-a716-aa0000000002';
const ROOT_ID      = '550e8400-e29b-41d4-a716-aa0000000003';
const FILE_ID      = '550e8400-e29b-41d4-a716-aa0000000004';
const DOC_ID       = '550e8400-e29b-41d4-a716-aa0000000005';
const CONTENT_ID   = '550e8400-e29b-41d4-a716-aa0000000006';
const YJS_ID       = '550e8400-e29b-41d4-a716-aa0000000007';

describe('isActive gate — dormant document must never invoke the collaborative reader', () => {
  const projectId  = ProjectId.create(PROJECT_ID);
  const memberId   = UserId.create(MEMBER_ID);
  const rootId     = FileNodeId.create(ROOT_ID);
  const fileId     = FileNodeId.create(FILE_ID);
  const docId      = DocumentId.create(DOC_ID);

  const document = new Document(
    docId,
    fileId,
    ContentId.create(CONTENT_ID),
    YjsStateId.create(YJS_ID),
    MimeType.create('text/asciidoc'),
  );
  const fileNode = new FileNode(fileId, projectId, rootId, 'doc.adoc', FileNodeType.create('file'), FilePath.create('/doc.adoc'));
  const rootNode = new FileNode(rootId, projectId, null, 'root', FileNodeType.create('folder'), FilePath.create('/'));

  async function buildRepos() {
    const projectRepo = new InMemoryProjectRepository();
    const fileNodeRepo = new InMemoryFileNodeRepository();
    const memberRepo = new InMemoryProjectMemberRepository();
    const documentRepo = new InMemoryDocumentRepository();
    const assetRepo = new InMemoryAssetRepository();
    const fileStore = new InMemoryProjectFileStore();
    const sessionRepo = new InMemoryCollaborationSessionRepository();
    // session is NOT opened → dormant

    await projectRepo.save(new Project(projectId, ProjectName.create('P'), null, [], rootId));
    await fileNodeRepo.save(rootNode);
    await fileNodeRepo.save(fileNode);
    await memberRepo.addMember(new ProjectMember(projectId, memberId, Role.create('viewer')));
    await documentRepo.save(document);
    await fileStore.write(projectId, fileNode.path, Buffer.from('= Stored Content'));

    return { projectRepo, fileNodeRepo, memberRepo, documentRepo, assetRepo, fileStore, sessionRepo };
  }

  function spyReader(): { reader: CollaborativeContentReader; readContent: jest.Mock } {
    const readContent = jest.fn().mockResolvedValue({ success: true, value: 'live content' });
    return { reader: { readContent }, readContent };
  }

  test('GetFileNodeContent does not call reader for dormant document', async () => {
    const { fileNodeRepo, memberRepo, documentRepo, assetRepo, fileStore, sessionRepo } = await buildRepos();
    const { reader, readContent } = spyReader();

    const useCase = new GetFileNodeContentUseCase(memberRepo, fileNodeRepo, documentRepo, assetRepo, fileStore, reader, sessionRepo);
    const result = await useCase.execute(memberId, projectId, fileId);

    expect(result.success).toBe(true);
    expect(readContent).not.toHaveBeenCalled();
  });

  test('DownloadFile does not call reader for dormant document', async () => {
    const { projectRepo, fileNodeRepo, memberRepo, documentRepo, fileStore, sessionRepo } = await buildRepos();
    const { reader, readContent } = spyReader();

    const useCase = new DownloadFileUseCase(projectRepo, fileNodeRepo, memberRepo, fileStore, documentRepo, sessionRepo, reader);
    const result = await useCase.execute(memberId, projectId, fileId);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.source.kind).toBe('stored');
    expect(readContent).not.toHaveBeenCalled();
  });

  test('DownloadProject does not call reader for dormant document', async () => {
    const { projectRepo, fileNodeRepo, memberRepo, documentRepo, sessionRepo } = await buildRepos();
    const { reader, readContent } = spyReader();

    const useCase = new DownloadProjectUseCase(projectRepo, fileNodeRepo, memberRepo, documentRepo, sessionRepo, reader);
    const result = await useCase.execute(memberId, projectId);

    expect(result.success).toBe(true);
    if (!result.success) return;
    const file = result.value.files.find((f) => f.fileNode.id.value === FILE_ID);
    expect(file?.source.kind).toBe('stored');
    expect(readContent).not.toHaveBeenCalled();
  });
});
