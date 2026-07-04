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
import { InMemoryDocumentRepository } from '../../ports/file-tree/in-memory-document.repository';
import { Document } from '../../../src/entities/document';
import { DocumentId } from '../../../src/value-objects/ids/document-id';
import { ContentId } from '../../../src/value-objects/ids/content-id';
import { YjsStateId } from '../../../src/value-objects/ids/yjs-state-id';
import { MimeType } from '../../../src/value-objects/files/mime-type';
import type { CollaborativeContentEditor, ContentReplacement } from '../../../src/ports/storage/collaborative-content-editor';
import type { CollaborativeContentReader } from '../../../src/ports/storage/collaborative-content-reader';
import type { Result } from '../../../src/types/result';

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

  // Feature 033: the in-editor rename suggestion fires AFTER the author has already retyped the
  // definition, so the document already carries the new name. `definitionAlreadyRenamed` tells the
  // use case to propagate the rename to the remaining old-name references without treating the
  // (expected) new-name definition as a merge conflict.
  it('with definitionAlreadyRenamed, rewrites lingering old-name references and does not flag the new definition as a conflict', async () => {
    // The definition is already `:revision:`; a stale `{edition}` reference remains.
    await fileStore.write(projectId, FilePath.create('/book.adoc'), Buffer.from(':revision: 2\n\nThis is the {edition} edition.\n'));
    const result = await useCase.execute(editorId, projectId, {
      symbolKind: 'attribute',
      oldName: 'edition',
      newName: 'revision',
      definitionAlreadyRenamed: true,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const book = await read('/book.adoc');
    expect(book).toContain(':revision: 2'); // definition untouched (FR-021)
    expect(book).toContain('{revision} edition'); // reference propagated
    expect(book).not.toContain('{edition}');
  });

  it('with definitionAlreadyRenamed, STILL blocks a genuine merge when the old name is also still defined', async () => {
    // Both `:edition:` and `:revision:` exist as distinct attributes: the flag must not be able to
    // merge them (guards against a caller misusing the flag to bypass the server conflict check).
    await fileStore.write(projectId, FilePath.create('/book.adoc'), Buffer.from(':edition: 1\n:revision: 2\n\n{edition}\n'));
    const before = await read('/book.adoc');
    const result = await useCase.execute(editorId, projectId, {
      symbolKind: 'attribute',
      oldName: 'edition',
      newName: 'revision',
      definitionAlreadyRenamed: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
    expect(await read('/book.adoc')).toBe(before); // nothing rewritten
  });
});

// US12 / FR-064 collab-safety: a file open for live collaborative editing must be rewritten through
// the Yjs source of truth (CollaborativeContentEditor), not the file store — otherwise the rename is
// invisible to the editor and clobbered by the next writeback. A file that is NOT open keeps the
// direct file-store write. Mirrors the file-rename rewrite's collab routing.
class FakeCollaborativeContentEditor implements CollaborativeContentEditor {
  calls: Array<{ yjsStateId: string; replacements: ContentReplacement[] }> = [];
  // When unset, every call reports each replacement as applied once (success). Override to force a
  // failure or a zero-applied (live-content-diverged) outcome.
  override?: Result<number, Error>;

  async applyReplacements(
    _projectId: ProjectId,
    yjsStateId: YjsStateId,
    replacements: ReadonlyArray<ContentReplacement>,
  ): Promise<Result<number, Error>> {
    this.calls.push({ yjsStateId: yjsStateId.value, replacements: [...replacements] });
    return this.override ?? { success: true, value: replacements.length };
  }
}

describe('RenameSymbolUseCase — collaborative source of truth', () => {
  // book.adoc is OPEN (has a collaborative Document); chapter.adoc is CLOSED. Both reference {edition}.
  const BOOK_ATTR = ':edition: 2\n\nThis is the {edition} edition.\n\ninclude::chapter.adoc[]\n';
  const CHAPTER_ATTR = 'Back in the {edition} edition.\n';
  const bookYjs = YjsStateId.create('11111111-e29b-41d4-a716-446655440111');

  let memberRepo: InMemoryProjectMemberRepository;
  let fileNodeRepo: InMemoryFileNodeRepository;
  let fileStore: InMemoryProjectFileStore;
  let auditRepo: InMemoryAuditLogRepository;
  let documentRepo: InMemoryDocumentRepository;
  let editor: FakeCollaborativeContentEditor;
  let useCase: RenameSymbolUseCase;

  const read = async (path: string): Promise<string> =>
    (await fileStore.read(projectId, FilePath.create(path)))!.toString('utf8');

  async function giveBookACollaborativeDocument(): Promise<void> {
    await documentRepo.save(
      new Document(
        DocumentId.create('22222222-e29b-41d4-a716-446655440222'),
        bookId,
        ContentId.create('33333333-e29b-41d4-a716-446655440333'),
        bookYjs,
        MimeType.create('text/asciidoc'),
      ),
    );
  }

  beforeEach(async () => {
    memberRepo = new InMemoryProjectMemberRepository();
    fileNodeRepo = new InMemoryFileNodeRepository();
    fileStore = new InMemoryProjectFileStore();
    auditRepo = new InMemoryAuditLogRepository();
    documentRepo = new InMemoryDocumentRepository();
    editor = new FakeCollaborativeContentEditor();
    useCase = new RenameSymbolUseCase(memberRepo, fileNodeRepo, fileStore, auditRepo, undefined, documentRepo, editor);

    await fileNodeRepo.save(new FileNode(rootId, projectId, null, 'Root', FileNodeType.create('folder'), FilePath.create('/')));
    await fileNodeRepo.save(new FileNode(bookId, projectId, rootId, 'book.adoc', FileNodeType.create('file'), FilePath.create('/book.adoc')));
    await fileNodeRepo.save(new FileNode(chapterId, projectId, rootId, 'chapter.adoc', FileNodeType.create('file'), FilePath.create('/chapter.adoc')));
    await fileStore.write(projectId, FilePath.create('/book.adoc'), Buffer.from(BOOK_ATTR));
    await fileStore.write(projectId, FilePath.create('/chapter.adoc'), Buffer.from(CHAPTER_ATTR));
    await memberRepo.addMember(new ProjectMember(projectId, editorId, Role.create('editor'), new Date()));
  });

  it('routes an OPEN file through the collab editor and writes a CLOSED file directly', async () => {
    await giveBookACollaborativeDocument();

    const result = await useCase.execute(editorId, projectId, { symbolKind: 'attribute', oldName: 'edition', newName: 'revision' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.rewrittenFiles).toBe(2);
    expect(result.value.warnings).toEqual([]);

    // OPEN file (book.adoc): rewritten via the Yjs source of truth, file store left to the writeback.
    expect(editor.calls).toHaveLength(1);
    expect(editor.calls[0].yjsStateId).toBe(bookYjs.value);
    let applied = BOOK_ATTR;
    for (const { find, replace } of editor.calls[0].replacements) applied = applied.split(find).join(replace);
    expect(applied).toContain(':revision: 2');
    expect(applied).toContain('{revision} edition');
    expect(await read('/book.adoc')).toBe(BOOK_ATTR); // file store NOT written for the open file

    // CLOSED file (chapter.adoc): written straight to the file store.
    expect(await read('/chapter.adoc')).toContain('{revision} edition');
    expect(await read('/chapter.adoc')).not.toContain('{edition}');
  });

  it('does not clobber the file store when the collab editor fails — warns instead', async () => {
    await giveBookACollaborativeDocument();
    editor.override = { success: false, error: new Error('collab unreachable') };

    const result = await useCase.execute(editorId, projectId, { symbolKind: 'attribute', oldName: 'edition', newName: 'revision' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    // Only the closed file was rewritten; the open file is warned about, not stale-written.
    expect(result.value.rewrittenFiles).toBe(1);
    expect(result.value.warnings.length).toBeGreaterThan(0);
    expect(await read('/book.adoc')).toBe(BOOK_ATTR); // unchanged — no stale write for the live Y.Text to overwrite
    expect(await read('/chapter.adoc')).toContain('{revision} edition');
  });

  it('does NOT report a phantom success when the collab editor applied zero occurrences (live diverged)', async () => {
    // The scanned content had the symbol, but by apply time the live Y.Text no longer matches (a
    // concurrent edit, or a stale-read fallback): applyReplacements succeeds at the transport layer
    // but replaces 0 occurrences. That file must be warned about, not counted as rewritten.
    await giveBookACollaborativeDocument();
    editor.override = { success: true, value: 0 };

    const result = await useCase.execute(editorId, projectId, { symbolKind: 'attribute', oldName: 'edition', newName: 'revision' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    // Only the CLOSED file (chapter.adoc, direct file-store write) is counted; the open file's
    // zero-applied collab write is surfaced as a warning, not a success.
    expect(result.value.rewrittenFiles).toBe(1);
    expect(result.value.warnings.length).toBeGreaterThan(0);
    expect(result.value.warnings.some((w) => w.includes('book.adoc'))).toBe(true);
  });

  it('reports the actual number of occurrences applied by the collab editor, not the staged edit count', async () => {
    await giveBookACollaborativeDocument();
    editor.override = { success: true, value: 5 }; // editor says it replaced 5 live occurrences

    const result = await useCase.execute(editorId, projectId, { symbolKind: 'attribute', oldName: 'edition', newName: 'revision' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    // book.adoc (collab, 5 occurrences) + chapter.adoc (file store, 1 occurrence) = 6.
    expect(result.value.updatedReferences).toBe(6);
  });

  it('scans LIVE content so it can rename a symbol that is not yet saved to the file store', async () => {
    // The folder2 bug: the file store is STALE (no :live: attribute), but the live editor has it.
    // With a reader wired, the scan must read live content and rename through the collab editor.
    await giveBookACollaborativeDocument();
    await fileStore.write(projectId, FilePath.create('/book.adoc'), Buffer.from('= Book\n\nstale file store, no attribute.\n'));
    const reader: CollaborativeContentReader = {
      async readContent(_p, id): Promise<Result<string, Error>> {
        return id.value === bookYjs.value
          ? { success: true, value: '= Book\n\n:live: 1\n\nUses {live}.\n' }
          : { success: false, error: new Error('unknown room') };
      },
    };
    const liveUseCase = new RenameSymbolUseCase(
      memberRepo, fileNodeRepo, fileStore, auditRepo, undefined, documentRepo, editor, reader,
    );

    const result = await liveUseCase.execute(editorId, projectId, { symbolKind: 'attribute', oldName: 'live', newName: 'fresh' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.rewrittenFiles).toBe(1);
    // The rename was routed through the collab editor, with find strings derived from LIVE content.
    expect(editor.calls).toHaveLength(1);
    expect(editor.calls[0].yjsStateId).toBe(bookYjs.value);
    let applied = '= Book\n\n:live: 1\n\nUses {live}.\n';
    for (const { find, replace } of editor.calls[0].replacements) applied = applied.split(find).join(replace);
    expect(applied).toContain(':fresh: 1');
    expect(applied).toContain('Uses {fresh}.');
  });

  it('without collaborative deps, writes the file store as before', async () => {
    await giveBookACollaborativeDocument();
    const plainUseCase = new RenameSymbolUseCase(memberRepo, fileNodeRepo, fileStore, auditRepo);

    const result = await plainUseCase.execute(editorId, projectId, { symbolKind: 'attribute', oldName: 'edition', newName: 'revision' });
    expect(result.success).toBe(true);
    expect(editor.calls).toHaveLength(0);
    expect(await read('/book.adoc')).toContain(':revision: 2');
    expect(await read('/book.adoc')).toContain('{revision} edition');
  });
});
