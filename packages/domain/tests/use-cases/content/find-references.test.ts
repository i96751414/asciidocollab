import { FindReferencesUseCase } from '../../../src/use-cases/content/find-references';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../../ports/file-tree/in-memory-file-node.repository';
import { InMemoryProjectFileStore } from '../../ports/storage/in-memory-project-file-store';
import { ProjectMember } from '../../../src/entities/project-member';
import { FileNode } from '../../../src/entities/file-node';
import { UserId } from '../../../src/value-objects/user-id';
import { ProjectId } from '../../../src/value-objects/project-id';
import { FileNodeId } from '../../../src/value-objects/file-node-id';
import { Role } from '../../../src/value-objects/role';
import { FileNodeType } from '../../../src/value-objects/file-node-type';
import { FilePath } from '../../../src/value-objects/file-path';

// US12 / FR-065: project-wide find-usages of a section id / anchor / attribute.

const actorId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
const nonMember = UserId.create('660e8400-e29b-41d4-a716-446655440002');
const projectId = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');
const rootId = FileNodeId.create('880e8400-e29b-41d4-a716-446655440004');
const bookId = FileNodeId.create('990e8400-e29b-41d4-a716-446655440005');
const chapterId = FileNodeId.create('aa0e8400-e29b-41d4-a716-446655440006');

const BOOK = '= Book\n\n[[intro]]\n== Intro\n\ninclude::chapter.adoc[]\n';
const CHAPTER = 'See <<intro>> for context, and again <<intro,here>>.\n\nUnrelated <<other>>.\n';

describe('FindReferencesUseCase', () => {
  let memberRepo: InMemoryProjectMemberRepository;
  let fileNodeRepo: InMemoryFileNodeRepository;
  let fileStore: InMemoryProjectFileStore;
  let useCase: FindReferencesUseCase;

  beforeEach(async () => {
    memberRepo = new InMemoryProjectMemberRepository();
    fileNodeRepo = new InMemoryFileNodeRepository();
    fileStore = new InMemoryProjectFileStore();
    useCase = new FindReferencesUseCase(memberRepo, fileNodeRepo, fileStore);

    await fileNodeRepo.save(new FileNode(rootId, projectId, null, 'Root', FileNodeType.create('folder'), FilePath.create('/')));
    await fileNodeRepo.save(new FileNode(bookId, projectId, rootId, 'book.adoc', FileNodeType.create('file'), FilePath.create('/book.adoc')));
    await fileNodeRepo.save(new FileNode(chapterId, projectId, rootId, 'chapter.adoc', FileNodeType.create('file'), FilePath.create('/chapter.adoc')));
    await fileStore.write(projectId, FilePath.create('/book.adoc'), Buffer.from(BOOK));
    await fileStore.write(projectId, FilePath.create('/chapter.adoc'), Buffer.from(CHAPTER));
    await memberRepo.addMember(new ProjectMember(projectId, actorId, Role.create('editor')));
  });

  it('finds every xref usage of an anchor across the project, with file path and offset', async () => {
    const result = await useCase.execute(actorId, projectId, 'intro');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.value).toHaveLength(2);
    expect(result.value.every((usage) => usage.path === 'chapter.adoc')).toBe(true);
    expect(result.value.every((usage) => usage.kind === 'xref')).toBe(true);
    // distinct offsets, ascending
    expect(result.value[0].range.from).toBeLessThan(result.value[1].range.from);
  });

  it('returns no usages for an id that is defined but never referenced', async () => {
    const result = await useCase.execute(actorId, projectId, 'unused-anchor');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toHaveLength(0);
  });

  it('rejects a non-member with PermissionDeniedError', async () => {
    const result = await useCase.execute(nonMember, projectId, 'intro');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.name).toBe('PermissionDeniedError');
  });
});
