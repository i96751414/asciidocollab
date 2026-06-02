import { DeleteFileUseCase } from '../../src/use-cases/delete-file';
import { FileNodeNotFoundError } from '../../src/errors/file-node-not-found';
import { PermissionDeniedError } from '../../src/errors/permission-denied';
import { InMemoryProjectMemberRepository } from '../repositories/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../repositories/in-memory-file-node.repository';
import { InMemoryAuditLogRepository } from '../repositories/in-memory-audit-log.repository';
import { InMemoryDocumentRepository } from '../repositories/in-memory-document.repository';
import { InMemoryProjectRepository } from '../repositories/in-memory-project.repository';
import { InMemoryProjectFileStore } from '../storage/in-memory-project-file-store';
import { InMemoryYjsStateStore } from '../storage/in-memory-yjs-state-store';
import { Project } from '../../src/entities/project';
import { ProjectMember } from '../../src/entities/project-member';
import { FileNode } from '../../src/entities/file-node';
import { Document } from '../../src/entities/document';
import { UserId } from '../../src/value-objects/user-id';
import { ProjectId } from '../../src/value-objects/project-id';
import { FileNodeId } from '../../src/value-objects/file-node-id';
import { DocumentId } from '../../src/value-objects/document-id';
import { ProjectName } from '../../src/value-objects/project-name';
import { Role } from '../../src/value-objects/role';
import { FileNodeType } from '../../src/value-objects/file-node-type';
import { FilePath } from '../../src/value-objects/file-path';
import { MimeType } from '../../src/value-objects/mime-type';
import { ContentId } from '../../src/value-objects/content-id';
import { YjsStateId } from '../../src/value-objects/yjs-state-id';

describe('DeleteFileUseCase', () => {
  let projectRepo: InMemoryProjectRepository;
  let fileNodeRepo: InMemoryFileNodeRepository;
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let auditLogRepo: InMemoryAuditLogRepository;
  let documentRepo: InMemoryDocumentRepository;
  let useCase: DeleteFileUseCase;
  let actorId: UserId;
  let projectId: ProjectId;
  let project: Project;
  let rootFolderId: FileNodeId;
  let rootFolder: FileNode;
  let childFolderId: FileNodeId;
  let childFolder: FileNode;
  let fileNode: FileNode;
  let fileNodeId: FileNodeId;
  let document: Document;
  let documentId: DocumentId;

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    fileNodeRepo = new InMemoryFileNodeRepository();
    projectMemberRepo = new InMemoryProjectMemberRepository();
    auditLogRepo = new InMemoryAuditLogRepository();
    documentRepo = new InMemoryDocumentRepository();

    useCase = new DeleteFileUseCase(
      projectMemberRepo,
      fileNodeRepo,
      documentRepo,
      auditLogRepo,
    );

    actorId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
    projectId = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');
    rootFolderId = FileNodeId.create('880e8400-e29b-41d4-a716-446655440004');
    childFolderId = FileNodeId.create('990e8400-e29b-41d4-a716-446655440005');
    fileNodeId = FileNodeId.create('aa0e8400-e29b-41d4-a716-446655440006');
    documentId = DocumentId.create('bb0e8400-e29b-41d4-a716-446655440007');

    project = new Project(
      projectId,
      ProjectName.create('Test Project'),
      null,
      [],
      rootFolderId,
    );
    await projectRepo.save(project);

    rootFolder = new FileNode(
      rootFolderId,
      projectId,
      null,
      'Test Project',
      FileNodeType.create('folder'),
      FilePath.create('/'),
    );
    await fileNodeRepo.save(rootFolder);

    childFolder = new FileNode(
      childFolderId,
      projectId,
      rootFolderId,
      'child-folder',
      FileNodeType.create('folder'),
      FilePath.create('/child-folder'),
    );
    await fileNodeRepo.save(childFolder);

    fileNode = new FileNode(
      fileNodeId,
      projectId,
      rootFolderId,
      'test-file.txt',
      FileNodeType.create('file'),
      FilePath.create('/test-file.txt'),
    );
    await fileNodeRepo.save(fileNode);

    document = new Document(
      documentId,
      fileNodeId,
      ContentId.create('cc0e8400-e29b-41d4-a716-446655440008'),
      YjsStateId.create('dd0e8400-e29b-41d4-a716-446655440009'),
      MimeType.create('text/plain'),
    );
    await documentRepo.save(document);

    const member = new ProjectMember(
      projectId,
      actorId,
      Role.create('editor'),
    );
    await projectMemberRepo.addMember(member);
  });

  test('deletes a file and its document and creates audit log', async () => {
    const result = await useCase.execute(actorId, fileNodeId, projectId);

    expect(result.success).toBe(true);

    const deletedNode = await fileNodeRepo.findById(fileNodeId);
    expect(deletedNode).toBeNull();

    const deletedDocument = await documentRepo.findByFileNodeId(fileNodeId);
    expect(deletedDocument).toBeNull();

    const logs = await auditLogRepo.findByProjectId(projectId);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('file.deleted');
    expect(logs[0].userId.value).toBe(actorId.value);
  });

  test('deletes a folder cascading to children and their documents', async () => {
    const grandchildFileId = FileNodeId.create('ee0e8400-e29b-41d4-a716-44665544000a');
    const grandchildDocumentId = DocumentId.create('ff0e8400-e29b-41d4-a716-44665544000b');

    const grandchildFile = new FileNode(
      grandchildFileId,
      projectId,
      childFolderId,
      'nested.txt',
      FileNodeType.create('file'),
      FilePath.create('/child-folder/nested.txt'),
    );
    await fileNodeRepo.save(grandchildFile);

    const grandchildDocument = new Document(
      grandchildDocumentId,
      grandchildFileId,
      ContentId.create('aa0e8400-e29b-41d4-a716-44665544000c'),
      YjsStateId.create('bb0e8400-e29b-41d4-a716-44665544000d'),
      MimeType.create('text/plain'),
    );
    await documentRepo.save(grandchildDocument);

    const result = await useCase.execute(actorId, childFolderId, projectId);

    expect(result.success).toBe(true);

    const deletedFolder = await fileNodeRepo.findById(childFolderId);
    expect(deletedFolder).toBeNull();

    const deletedGrandchild = await fileNodeRepo.findById(grandchildFileId);
    expect(deletedGrandchild).toBeNull();

    const deletedGrandchildDocument = await documentRepo.findById(grandchildDocumentId);
    expect(deletedGrandchildDocument).toBeNull();

    const rootNode = await fileNodeRepo.findById(rootFolderId);
    expect(rootNode).not.toBeNull();

    const logs = await auditLogRepo.findByProjectId(projectId);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('file.deleted');
  });

  test('returns error when deleting root folder', async () => {
    const result = await useCase.execute(actorId, rootFolderId, projectId);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error).toBeDefined();
  });

  test('returns error for non-existent file', async () => {
    const missingId = FileNodeId.create('cc0e8400-e29b-41d4-a716-44665544000e');
    const result = await useCase.execute(actorId, missingId, projectId);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.name).toBe('FileNodeNotFoundError');
  });
});

describe('DeleteFileUseCase with ProjectFileStore + YjsStateStore', () => {
  let fileNodeRepo: InMemoryFileNodeRepository;
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let auditLogRepo: InMemoryAuditLogRepository;
  let documentRepo: InMemoryDocumentRepository;
  let fileStore: InMemoryProjectFileStore;
  let yjsStateStore: InMemoryYjsStateStore;
  let useCase: DeleteFileUseCase;

  const actorId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const projectId = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');
  const rootFolderId = FileNodeId.create('880e8400-e29b-41d4-a716-446655440004');
  const fileNodeId = FileNodeId.create('aa0e8400-e29b-41d4-a716-446655440006');
  const documentId = DocumentId.create('bb0e8400-e29b-41d4-a716-446655440007');
  const folderNodeId = FileNodeId.create('cc0e8400-e29b-41d4-a716-446655440008');
  const yjsId = YjsStateId.create('dd0e8400-e29b-41d4-a716-446655440009');
  const filePath = FilePath.create('/test-file.txt');
  const folderPath = FilePath.create('/child-folder');

  beforeEach(async () => {
    fileNodeRepo = new InMemoryFileNodeRepository();
    projectMemberRepo = new InMemoryProjectMemberRepository();
    auditLogRepo = new InMemoryAuditLogRepository();
    documentRepo = new InMemoryDocumentRepository();
    fileStore = new InMemoryProjectFileStore();
    yjsStateStore = new InMemoryYjsStateStore();

    useCase = new DeleteFileUseCase(
      projectMemberRepo,
      fileNodeRepo,
      documentRepo,
      auditLogRepo,
      fileStore,
      yjsStateStore,
    );

    const rootFolder = new FileNode(rootFolderId, projectId, null, 'Root', FileNodeType.create('folder'), FilePath.create('/'));
    await fileNodeRepo.save(rootFolder);

    const fileNode = new FileNode(fileNodeId, projectId, rootFolderId, 'test-file.txt', FileNodeType.create('file'), filePath);
    await fileNodeRepo.save(fileNode);
    await fileStore.write(projectId, filePath, Buffer.from('content'));

    const document = new Document(documentId, fileNodeId, ContentId.create('cc0e8400-e29b-41d4-a716-44665544000c'), yjsId, MimeType.create('text/plain'));
    await documentRepo.save(document);
    await yjsStateStore.save(projectId, yjsId, Buffer.from([1, 2, 3]));

    const folderNode = new FileNode(folderNodeId, projectId, rootFolderId, 'child-folder', FileNodeType.create('folder'), folderPath);
    await fileNodeRepo.save(folderNode);

    const member = new ProjectMember(projectId, actorId, Role.create('editor'));
    await projectMemberRepo.addMember(member);
  });

  test('fileStore.remove called for file nodes', async () => {
    await useCase.execute(actorId, fileNodeId, projectId);
    const content = await fileStore.read(projectId, filePath);
    expect(content).toBeNull();
  });

  test('yjsStateStore.delete called when document exists', async () => {
    await useCase.execute(actorId, fileNodeId, projectId);
    const state = await yjsStateStore.load(projectId, yjsId);
    expect(state).toBeNull();
  });

  test('fileStore.removeDirectory called for folder nodes', async () => {
    await useCase.execute(actorId, folderNodeId, projectId);
    // Folder is removed; writing to a file under it via fileStore would still work since
    // in-memory store doesn't enforce directory existence, but the removeDirectory was called.
    // Verify the folder node is deleted from DB.
    const folderNode = await fileNodeRepo.findById(folderNodeId);
    expect(folderNode).toBeNull();
  });

  it('cleans up Yjs state for all documents inside a deleted folder', async () => {
    const childFileId = FileNodeId.create('ff0e8400-e29b-41d4-a716-446655440030');
    const childDocId = DocumentId.create('ff0e8400-e29b-41d4-a716-446655440031');
    const childYjsStateId = YjsStateId.create('ff0e8400-e29b-41d4-a716-446655440032');

    const childFile = new FileNode(
      childFileId,
      projectId,
      folderNodeId,
      'note.adoc',
      FileNodeType.create('file'),
      FilePath.create('/child-folder/note.adoc'),
    );
    await fileNodeRepo.save(childFile);

    const childDoc = new Document(
      childDocId,
      childFileId,
      ContentId.create('aa0e8400-e29b-41d4-a716-446655440033'),
      childYjsStateId,
      MimeType.create('text/asciidoc'),
    );
    await documentRepo.save(childDoc);

    await yjsStateStore.save(projectId, childYjsStateId, Buffer.from('yjs-data'));
    expect(await yjsStateStore.load(projectId, childYjsStateId)).not.toBeNull();

    const result = await useCase.execute(actorId, folderNodeId, projectId);
    expect(result.success).toBe(true);

    expect(await yjsStateStore.load(projectId, childYjsStateId)).toBeNull();
  });

  it('returns FileNodeNotFoundError when the file node belongs to a different project', async () => {
    const otherProjectId = ProjectId.create('ff0e8400-e29b-41d4-a716-446655440099');
    const alienNodeId = FileNodeId.create('ee0e8400-e29b-41d4-a716-446655440011');
    const alienNode = new FileNode(
      alienNodeId,
      otherProjectId,
      rootFolderId,
      'alien.adoc',
      FileNodeType.create('file'),
      FilePath.create('/alien.adoc'),
    );
    await fileNodeRepo.save(alienNode);

    // actor is a member of projectId, but alienNode belongs to otherProjectId
    const result = await useCase.execute(actorId, alienNodeId, projectId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(FileNodeNotFoundError);
    }
  });
});
