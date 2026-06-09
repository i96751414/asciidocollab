import { AuthorizeCollabConnectionUseCase } from '../../../src/use-cases/content/authorize-collab-connection';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../../ports/file-tree/in-memory-file-node.repository';
import { InMemoryDocumentRepository } from '../../ports/file-tree/in-memory-document.repository';
import { ProjectMember } from '../../../src/entities/project-member';
import { FileNode } from '../../../src/entities/file-node';
import { Document } from '../../../src/entities/document';
import { UserId } from '../../../src/value-objects/user-id';
import { ProjectId } from '../../../src/value-objects/project-id';
import { FileNodeId } from '../../../src/value-objects/file-node-id';
import { DocumentId } from '../../../src/value-objects/document-id';
import { Role } from '../../../src/value-objects/role';
import { FileNodeType } from '../../../src/value-objects/file-node-type';
import { FilePath } from '../../../src/value-objects/file-path';
import { MimeType } from '../../../src/value-objects/mime-type';
import { ContentId } from '../../../src/value-objects/content-id';
import { YjsStateId } from '../../../src/value-objects/yjs-state-id';
import { CollabConnectionDeniedError } from '../../../src/errors/collab-connection-denied';

describe('AuthorizeCollabConnectionUseCase', () => {
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let fileNodeRepo: InMemoryFileNodeRepository;
  let documentRepo: InMemoryDocumentRepository;
  let useCase: AuthorizeCollabConnectionUseCase;

  const editorId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const viewerId = UserId.create('550e8400-e29b-41d4-a716-446655440002');
  const nonMemberId = UserId.create('550e8400-e29b-41d4-a716-446655440009');
  const projectId = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');
  const otherProjectId = ProjectId.create('770e8400-e29b-41d4-a716-44665544000a');
  const rootFolderId = FileNodeId.create('880e8400-e29b-41d4-a716-446655440004');
  const fileNodeId = FileNodeId.create('aa0e8400-e29b-41d4-a716-446655440006');
  const documentId = DocumentId.create('bb0e8400-e29b-41d4-a716-446655440007');
  const yjsStateId = YjsStateId.create('dd0e8400-e29b-41d4-a716-446655440009');
  const unknownYjsStateId = YjsStateId.create('dd0e8400-e29b-41d4-a716-44665544000b');

  beforeEach(async () => {
    projectMemberRepo = new InMemoryProjectMemberRepository();
    fileNodeRepo = new InMemoryFileNodeRepository();
    documentRepo = new InMemoryDocumentRepository();
    useCase = new AuthorizeCollabConnectionUseCase(projectMemberRepo, fileNodeRepo, documentRepo);

    const rootFolder = new FileNode(rootFolderId, projectId, null, 'Test', FileNodeType.create('folder'), FilePath.create('/'));
    await fileNodeRepo.save(rootFolder);
    const fileNode = new FileNode(fileNodeId, projectId, rootFolderId, 'test.adoc', FileNodeType.create('file'), FilePath.create('/test.adoc'));
    await fileNodeRepo.save(fileNode);

    const document = new Document(
      documentId,
      fileNodeId,
      ContentId.create('cc0e8400-e29b-41d4-a716-446655440008'),
      yjsStateId,
      MimeType.create('text/asciidoc'),
    );
    await documentRepo.save(document);

    await projectMemberRepo.addMember(new ProjectMember(projectId, editorId, Role.create('editor')));
    await projectMemberRepo.addMember(new ProjectMember(projectId, viewerId, Role.create('viewer')));
  });

  it('authorizes an editor member with role "editor"', async () => {
    const result = await useCase.execute(editorId, projectId, yjsStateId);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.role).toBe('editor');
  });

  it('maps a viewer member to role "observer"', async () => {
    const result = await useCase.execute(viewerId, projectId, yjsStateId);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.role).toBe('observer');
  });

  it('denies with reason "document_not_found" when no document has the yjsStateId', async () => {
    const result = await useCase.execute(editorId, projectId, unknownYjsStateId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(CollabConnectionDeniedError);
      expect(result.error.reason).toBe('document_not_found');
    }
  });

  it('denies with reason "cross_project" when the document belongs to a different project', async () => {
    // The document exists but the caller claims a project that does not own its file node.
    const result = await useCase.execute(editorId, otherProjectId, yjsStateId);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.reason).toBe('cross_project');
  });

  it('denies with reason "not_a_member" when the user is not a project member', async () => {
    const result = await useCase.execute(nonMemberId, projectId, yjsStateId);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.reason).toBe('not_a_member');
  });
});
