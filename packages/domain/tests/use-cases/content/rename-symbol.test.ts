import { RenameSymbolUseCase } from '../../../src/use-cases/content/rename-symbol';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../../ports/file-tree/in-memory-file-node.repository';
import { InMemoryProjectFileStore } from '../../ports/storage/in-memory-project-file-store';
import { InMemoryAuditLogRepository } from '../../ports/admin/in-memory-audit-log.repository';
import { ProjectMember } from '../../../src/entities/project-member';
import { FileNode } from '../../../src/entities/file-node';
import { UserId } from '../../../src/value-objects/ids/user-id';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { FileNodeId } from '../../../src/value-objects/ids/file-node-id';
import { Role } from '../../../src/value-objects/identity/role';
import { FileNodeType } from '../../../src/value-objects/files/file-node-type';
import { FilePath } from '../../../src/value-objects/files/file-path';
import { PermissionDeniedError } from '../../../src/errors/common/permission-denied';
import { ValidationError } from '../../../src/errors/common/validation-error';

// US12 / FR-064: rename a section id / block anchor / attribute and update every
// `<<id>>` / `xref:` / `{attr}` reference to it across the project's documents.

const editorId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
const viewerId = UserId.create('660e8400-e29b-41d4-a716-446655440002');
const nonMember = UserId.create('770e8400-e29b-41d4-a716-446655440003');
const projectId = ProjectId.create('880e8400-e29b-41d4-a716-446655440004');
const rootId = FileNodeId.create('990e8400-e29b-41d4-a716-446655440005');
const bookId = FileNodeId.create('aa0e8400-e29b-41d4-a716-446655440006');
const chapterId = FileNodeId.create('bb0e8400-e29b-41d4-a716-446655440007');

const BOOK = '= Book\n\n[[intro]]\n== Intro\n\nSee <<intro>> and {edition}.\n\ninclude::chapter.adoc[]\n';
const CHAPTER = 'Back to <<intro,the intro>> and the cross-file <<book.adoc#intro>>.\n\nUnrelated <<other>>.\n';

describe('RenameSymbolUseCase', () => {
  let memberRepo: InMemoryProjectMemberRepository;
  let fileNodeRepo: InMemoryFileNodeRepository;
  let fileStore: InMemoryProjectFileStore;
  let auditRepo: InMemoryAuditLogRepository;
  let useCase: RenameSymbolUseCase;

  beforeEach(async () => {
    memberRepo = new InMemoryProjectMemberRepository();
    fileNodeRepo = new InMemoryFileNodeRepository();
    fileStore = new InMemoryProjectFileStore();
    auditRepo = new InMemoryAuditLogRepository();
    useCase = new RenameSymbolUseCase(memberRepo, fileNodeRepo, fileStore, auditRepo);

    await fileNodeRepo.save(new FileNode(rootId, projectId, null, 'Root', FileNodeType.create('folder'), FilePath.create('/')));
    await fileNodeRepo.save(new FileNode(bookId, projectId, rootId, 'book.adoc', FileNodeType.create('file'), FilePath.create('/book.adoc')));
    await fileNodeRepo.save(new FileNode(chapterId, projectId, rootId, 'chapter.adoc', FileNodeType.create('file'), FilePath.create('/chapter.adoc')));
    await fileStore.write(projectId, FilePath.create('/book.adoc'), Buffer.from(BOOK));
    await fileStore.write(projectId, FilePath.create('/chapter.adoc'), Buffer.from(CHAPTER));
    await memberRepo.addMember(new ProjectMember(projectId, editorId, Role.create('editor'), new Date()));
    await memberRepo.addMember(new ProjectMember(projectId, viewerId, Role.create('viewer'), new Date()));
  });

  const read = async (path: string): Promise<string> =>
    (await fileStore.read(projectId, FilePath.create(path)))!.toString('utf8');

  it('renames an anchor definition and every xref reference across files', async () => {
    const result = await useCase.execute(editorId, projectId, { symbolKind: 'anchor', oldName: 'intro', newName: 'overview' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.rewrittenFiles).toBe(2);

    const book = await read('/book.adoc');
    expect(book).toContain('[[overview]]');
    expect(book).toContain('See <<overview>>');
    expect(book).not.toContain('<<intro>>');
    expect(book).not.toContain('[[intro]]');

    const chapter = await read('/chapter.adoc');
    expect(chapter).toContain('<<overview,the intro>>'); // label preserved
    expect(chapter).toContain('<<book.adoc#overview>>'); // cross-file fragment rewritten, path preserved
    expect(chapter).toContain('<<other>>'); // unrelated anchor untouched
  });

  it('renames an attribute definition and references case-insensitively', async () => {
    await fileStore.write(projectId, FilePath.create('/book.adoc'), Buffer.from(':edition: 2\n\nThis is the {edition} edition; also {Edition}.\n'));
    const result = await useCase.execute(editorId, projectId, { symbolKind: 'attribute', oldName: 'edition', newName: 'revision' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const book = await read('/book.adoc');
    expect(book).toContain(':revision: 2');
    expect(book).toContain('{revision} edition');
    expect(book).toContain('also {revision}'); // {Edition} matched case-insensitively
    expect(book).not.toMatch(/\{edition\}|\{Edition\}|:edition:/);
  });

  it('denies a viewer (no edit permission) and writes nothing', async () => {
    const before = await read('/book.adoc');
    const result = await useCase.execute(viewerId, projectId, { symbolKind: 'anchor', oldName: 'intro', newName: 'overview' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
    expect(await read('/book.adoc')).toBe(before);
  });

  it('denies a non-member', async () => {
    const result = await useCase.execute(nonMember, projectId, { symbolKind: 'anchor', oldName: 'intro', newName: 'overview' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
  });

  it('rejects an invalid new anchor name and writes nothing', async () => {
    const before = await read('/book.adoc');
    const result = await useCase.execute(editorId, projectId, { symbolKind: 'anchor', oldName: 'intro', newName: '1 bad name' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
    expect(await read('/book.adoc')).toBe(before);
  });

  it('refuses to rename onto an id that is already defined (would merge symbols)', async () => {
    await fileStore.write(projectId, FilePath.create('/chapter.adoc'), Buffer.from('[[summary]]\n== Summary\n\n<<intro>>\n'));
    const before = await read('/book.adoc');
    const result = await useCase.execute(editorId, projectId, { symbolKind: 'anchor', oldName: 'intro', newName: 'summary' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
    expect(await read('/book.adoc')).toBe(before);
  });

  it('records a success audit entry on rename', async () => {
    await useCase.execute(editorId, projectId, { symbolKind: 'anchor', oldName: 'intro', newName: 'overview' });
    const logs = await auditRepo.findByProjectId(projectId);
    expect(logs.some((log) => log.action === 'symbol.renamed')).toBe(true);
  });
});
