import { RenameSymbolUseCase } from '../../../src/use-cases/content/rename-symbol';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../../ports/file-tree/in-memory-file-node.repository';
import { InMemoryProjectFileStore } from '../../ports/storage/in-memory-project-file-store';
import { FakeReferenceExtractor } from '../../ports/asciidoc/fake-reference-extractor';
import { ProjectMember } from '../../../src/entities/project-member';
import { FileNode } from '../../../src/entities/file-node';
import { UserId } from '../../../src/value-objects/user-id';
import { ProjectId } from '../../../src/value-objects/project-id';
import { FileNodeId } from '../../../src/value-objects/file-node-id';
import { Role } from '../../../src/value-objects/role';
import { FileNodeType } from '../../../src/value-objects/file-node-type';
import { FilePath } from '../../../src/value-objects/file-path';

// US12 / FR-064 + FR-067: rename a section id / anchor / attribute and update every
// reference across the project; refuse a rename that would create a duplicate id.

const actor = UserId.create('550e8400-e29b-41d4-a716-446655440001');
const nonMember = UserId.create('660e8400-e29b-41d4-a716-446655440002');
const project = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');
const rootId = FileNodeId.create('880e8400-e29b-41d4-a716-446655440004');
const bookId = FileNodeId.create('990e8400-e29b-41d4-a716-446655440005');
const chapterId = FileNodeId.create('aa0e8400-e29b-41d4-a716-446655440006');

const BOOK = '[[intro]]\n== Intro\n\nSee <<intro>> and <<intro,the intro>>.\n\n:flag:\nValue is {flag}.\n';
const CHAPTER = 'Back to <<intro>> again.\n\nAlso {flag} here.\n';

describe('RenameSymbolUseCase', () => {
  let memberRepo: InMemoryProjectMemberRepository;
  let fileNodeRepo: InMemoryFileNodeRepository;
  let fileStore: InMemoryProjectFileStore;
  let useCase: RenameSymbolUseCase;

  beforeEach(async () => {
    memberRepo = new InMemoryProjectMemberRepository();
    fileNodeRepo = new InMemoryFileNodeRepository();
    fileStore = new InMemoryProjectFileStore();
    useCase = new RenameSymbolUseCase(memberRepo, fileNodeRepo, fileStore, new FakeReferenceExtractor());

    await fileNodeRepo.save(new FileNode(rootId, project, null, 'Root', FileNodeType.create('folder'), FilePath.create('/')));
    await fileNodeRepo.save(new FileNode(bookId, project, rootId, 'book.adoc', FileNodeType.create('file'), FilePath.create('/book.adoc')));
    await fileNodeRepo.save(new FileNode(chapterId, project, rootId, 'chapter.adoc', FileNodeType.create('file'), FilePath.create('/chapter.adoc')));
    await fileStore.write(project, FilePath.create('/book.adoc'), Buffer.from(BOOK));
    await fileStore.write(project, FilePath.create('/chapter.adoc'), Buffer.from(CHAPTER));
    await memberRepo.addMember(new ProjectMember(project, actor, Role.create('editor')));
  });

  const read = async (name: string): Promise<string> =>
    (await fileStore.read(project, FilePath.create(`/${name}`)))!.toString('utf8');

  it('renames an anchor definition and every xref to it across files', async () => {
    const result = await useCase.execute(actor, project, 'anchor', 'intro', 'overview');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.filesChanged).toBe(2);

    const book = await read('book.adoc');
    expect(book).toContain('[[overview]]');
    expect(book).toContain('<<overview>>');
    expect(book).toContain('<<overview,the intro>>'); // label text untouched
    expect(book).not.toContain('<<intro>>');
    expect(book).not.toContain('[[intro]]');

    const chapter = await read('chapter.adoc');
    expect(chapter).toContain('<<overview>>');
    expect(chapter).not.toContain('<<intro>>');
  });

  it('renames an attribute definition and every {ref} to it', async () => {
    const result = await useCase.execute(actor, project, 'attribute', 'flag', 'feature');
    expect(result.success).toBe(true);

    const book = await read('book.adoc');
    expect(book).toContain(':feature:');
    expect(book).toContain('{feature}');
    expect(book).not.toContain('{flag}');

    const chapter = await read('chapter.adoc');
    expect(chapter).toContain('{feature}');
  });

  it('refuses to rename onto an existing id of the same kind (FR-067) and changes nothing', async () => {
    await fileStore.write(project, FilePath.create('/chapter.adoc'), Buffer.from('[[overview]]\n== Overview\n\n<<intro>>\n'));
    const result = await useCase.execute(actor, project, 'anchor', 'intro', 'overview');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.name).toBe('ValidationError');

    // unchanged
    expect(await read('book.adoc')).toContain('<<intro>>');
  });

  it('rejects a non-member with PermissionDeniedError', async () => {
    const result = await useCase.execute(nonMember, project, 'anchor', 'intro', 'overview');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.name).toBe('PermissionDeniedError');
  });

  it('rejects an invalid new name with ValidationError', async () => {
    const result = await useCase.execute(actor, project, 'anchor', 'intro', 'has spaces');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.name).toBe('ValidationError');
  });
});
