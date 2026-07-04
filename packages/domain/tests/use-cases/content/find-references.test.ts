import { FindReferencesUseCase } from '../../../src/use-cases/content/find-references';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryProjectRepository } from '../../ports/project/in-memory-project.repository';
import { InMemoryFileNodeRepository } from '../../ports/file-tree/in-memory-file-node.repository';
import { InMemoryProjectFileStore } from '../../ports/storage/in-memory-project-file-store';
import { Project } from '../../../src/entities/project';
import { ProjectName } from '../../../src/value-objects/project/project-name';
import { ProjectMember } from '../../../src/entities/project-member';
import { FileNode } from '../../../src/entities/file-node';
import { UserId } from '../../../src/value-objects/ids/user-id';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { FileNodeId } from '../../../src/value-objects/ids/file-node-id';
import { Role } from '../../../src/value-objects/identity/role';
import { FileNodeType } from '../../../src/value-objects/files/file-node-type';
import { FilePath } from '../../../src/value-objects/files/file-path';
import { InMemoryDocumentRepository } from '../../ports/file-tree/in-memory-document.repository';
import { Document } from '../../../src/entities/document';
import { DocumentId } from '../../../src/value-objects/ids/document-id';
import { ContentId } from '../../../src/value-objects/ids/content-id';
import { YjsStateId } from '../../../src/value-objects/ids/yjs-state-id';
import { MimeType } from '../../../src/value-objects/files/mime-type';
import type { CollaborativeContentReader } from '../../../src/ports/storage/collaborative-content-reader';
import type { Result } from '../../../src/types/result';

// Project-wide find-usages of a section id / anchor / attribute.

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

  it('finds the anchor definition plus every xref usage across the project, with path and offset', async () => {
    const result = await useCase.execute(actorId, projectId, 'intro');
    expect(result.success).toBe(true);
    if (!result.success) return;

    // The `[[intro]]` definition in book.adoc + two `<<intro>>` references in chapter.adoc.
    expect(result.value).toHaveLength(3);
    const definitions = result.value.filter((usage) => usage.kind === 'definition');
    expect(definitions).toHaveLength(1);
    expect(definitions[0].path).toBe('book.adoc');
    const xrefs = result.value.filter((usage) => usage.kind === 'xref');
    expect(xrefs).toHaveLength(2);
    expect(xrefs.every((usage) => usage.path === 'chapter.adoc')).toBe(true);
    // distinct offsets, ascending within the file
    expect(xrefs[0].range.from).toBeLessThan(xrefs[1].range.from);
  });

  it('returns the definition site for a symbol that is defined but never referenced (the folder2 case)', async () => {
    // An attribute declared in a file but used nowhere must still be discoverable — otherwise
    // find-usages reports "not found" for a symbol the user just defined.
    await fileStore.write(projectId, FilePath.create('/book.adoc'), Buffer.from('= Book\n\n:solo: value\n\nNo references here.\n'));
    const result = await useCase.execute(actorId, projectId, 'solo');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].kind).toBe('definition');
    expect(result.value[0].path).toBe('book.adoc');
  });

  it('returns an auto-generated section id (a plain heading with no explicit anchor) as a definition', async () => {
    // A heading's derived id lives in the same xref namespace as an explicit anchor, so find-usages
    // must report the heading itself as a definition — otherwise a rename that would collide two
    // headings on the same slug is invisible to the collision guard (feature 033).
    await fileStore.write(projectId, FilePath.create('/book.adoc'), Buffer.from('= Book\n\n== Setup\n'));
    await fileStore.write(projectId, FilePath.create('/chapter.adoc'), Buffer.from('See <<_setup>>.\n'));
    const result = await useCase.execute(actorId, projectId, '_setup', 'anchor');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const definitions = result.value.filter((usage) => usage.kind === 'definition');
    expect(definitions).toHaveLength(1);
    expect(definitions[0].path).toBe('book.adoc');
    expect(result.value.some((usage) => usage.kind === 'xref' && usage.path === 'chapter.adoc')).toBe(true);
  });

  it('restricts results to the selected kind when an id and an attribute share a name', async () => {
    // Bug repro: `intro` is both a section id (`[[intro]]` + `<<intro>>`) and an attribute
    // (`:intro:` + `{intro}`). Selecting "id / anchor" must NOT list the attribute usages.
    await fileStore.write(projectId, FilePath.create('/book.adoc'), Buffer.from('= Book\n\n[[intro]]\n== Intro\n\n:intro: value\n'));
    await fileStore.write(projectId, FilePath.create('/chapter.adoc'), Buffer.from('See <<intro>>.\n\nAlso {intro} here.\n'));

    const anchors = await useCase.execute(actorId, projectId, 'intro', 'anchor');
    expect(anchors.success).toBe(true);
    if (!anchors.success) return;
    expect(anchors.value.map((u) => u.kind).toSorted()).toEqual(['definition', 'xref']);

    const attributes = await useCase.execute(actorId, projectId, 'intro', 'attribute');
    expect(attributes.success).toBe(true);
    if (!attributes.success) return;
    expect(attributes.value.map((u) => u.kind).toSorted()).toEqual(['attributeRef', 'definition']);

    // No kind → both families, preserving the original (unfiltered) behavior.
    const both = await useCase.execute(actorId, projectId, 'intro');
    expect(both.success).toBe(true);
    if (!both.success) return;
    expect(both.value.map((u) => u.kind).toSorted()).toEqual(['attributeRef', 'definition', 'definition', 'xref']);
  });

  it('derives a section id with the idprefix/idseparator a PARENT set above the include', async () => {
    // book.adoc sets `:idprefix: sec_` / `:idseparator: -` then includes chapter.adoc, so the
    // chapter's `== My Section` renders as id `sec_my-section` (not the default `_my_section`).
    // find-usages must derive the SAME inherited id so the `<<sec_my-section>>` xref resolves to it —
    // it can only do that when the project main file is known (via the project repo).
    await fileStore.write(
      projectId,
      FilePath.create('/book.adoc'),
      Buffer.from('= Book\n:idprefix: sec_\n:idseparator: -\n\ninclude::chapter.adoc[]\n\nSee <<sec_my-section>>.\n'),
    );
    await fileStore.write(projectId, FilePath.create('/chapter.adoc'), Buffer.from('== My Section\n\nBody.\n'));

    // Without the project repo the main file is unknown → no inheritance → the chapter id is the
    // default `_my_section`, so the inherited-id query matches the literal `<<sec_my-section>>` xref
    // but never the section DEFINITION (its derived id doesn't match).
    const blind = await useCase.execute(actorId, projectId, 'sec_my-section', 'anchor');
    expect(blind.success).toBe(true);
    if (blind.success) expect(blind.value.some((usage) => usage.kind === 'definition')).toBe(false);

    // With the main file configured, the inherited prefix/separator resolve the id.
    const projectRepo = new InMemoryProjectRepository();
    const project = new Project(projectId, ProjectName.create('Book'), null, [], rootId, undefined, null, bookId);
    await projectRepo.save(project);
    const inheritanceAware = new FindReferencesUseCase(
      memberRepo, fileNodeRepo, fileStore, undefined, undefined, undefined, projectRepo,
    );

    const result = await inheritanceAware.execute(actorId, projectId, 'sec_my-section', 'anchor');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const definitions = result.value.filter((usage) => usage.kind === 'definition');
    expect(definitions).toHaveLength(1);
    expect(definitions[0].path).toBe('chapter.adoc');
    expect(result.value.some((usage) => usage.kind === 'xref' && usage.path === 'book.adoc')).toBe(true);
  });

  it('returns no usages for a name that appears nowhere', async () => {
    const result = await useCase.execute(actorId, projectId, 'totally-absent');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toHaveLength(0);
  });

  it('rejects a non-member with PermissionDeniedError', async () => {
    const result = await useCase.execute(nonMember, projectId, 'intro');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.name).toBe('PermissionDeniedError');
  });

  it('scans the LIVE Yjs content for an open file, finding a symbol not yet saved to the file store', async () => {
    // Reproduces the folder2 bug: the file store lags the editor (no `:folder2:`), but the live
    // collaborative content has it. find-usages must scan the live content for an open file.
    const documentRepo = new InMemoryDocumentRepository();
    const yjsStateId = YjsStateId.create('11111111-e29b-41d4-a716-446655440111');
    await documentRepo.save(
      new Document(
        DocumentId.create('22222222-e29b-41d4-a716-446655440222'),
        bookId,
        ContentId.create('33333333-e29b-41d4-a716-446655440333'),
        yjsStateId,
        MimeType.create('text/asciidoc'),
      ),
    );
    // File store is STALE — it has no `folder2` at all.
    await fileStore.write(projectId, FilePath.create('/book.adoc'), Buffer.from('= Book\n\nstale, no attribute here.\n'));
    const liveReader: CollaborativeContentReader = {
      async readContent(_p, id): Promise<Result<string, Error>> {
        return id.value === yjsStateId.value
          ? { success: true, value: '= Book\n\n:folder2: value\n\nUses {folder2}.\n' }
          : { success: false, error: new Error('unknown room') };
      },
    };
    const liveUseCase = new FindReferencesUseCase(memberRepo, fileNodeRepo, fileStore, documentRepo, liveReader);

    const result = await liveUseCase.execute(actorId, projectId, 'folder2');
    expect(result.success).toBe(true);
    if (!result.success) return;
    // The `:folder2:` definition + the `{folder2}` reference, both from the LIVE content.
    expect(result.value.map((u) => u.kind).toSorted()).toEqual(['attributeRef', 'definition']);
    expect(result.value.every((u) => u.path === 'book.adoc')).toBe(true);
  });

  it('falls back to the file store (with a warning) when the live read fails for an open file', async () => {
    const documentRepo = new InMemoryDocumentRepository();
    const yjsStateId = YjsStateId.create('11111111-e29b-41d4-a716-446655440111');
    await documentRepo.save(
      new Document(
        DocumentId.create('22222222-e29b-41d4-a716-446655440222'),
        bookId,
        ContentId.create('33333333-e29b-41d4-a716-446655440333'),
        yjsStateId,
        MimeType.create('text/asciidoc'),
      ),
    );
    // The file store DOES have the anchor; the live read errors → the scan must degrade to it.
    await fileStore.write(projectId, FilePath.create('/book.adoc'), Buffer.from('= Book\n\n[[fromdisk]]\n== Heading\n'));
    const warnings: string[] = [];
    const logger = { warn: (m: string) => warnings.push(m), info: () => {}, error: () => {}, debug: () => {} } as never;
    const failingReader: CollaborativeContentReader = {
      async readContent(): Promise<Result<string, Error>> {
        return { success: false, error: new Error('collab unreachable') };
      },
    };
    const useCaseWithFallback = new FindReferencesUseCase(memberRepo, fileNodeRepo, fileStore, documentRepo, failingReader, logger);

    const result = await useCaseWithFallback.execute(actorId, projectId, 'fromdisk');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].kind).toBe('definition');
    expect(warnings.length).toBeGreaterThan(0); // the degraded read was logged
  });

  it('uses the file store WITHOUT warning when there is no live source (reader returns null)', async () => {
    const documentRepo = new InMemoryDocumentRepository();
    await documentRepo.save(
      new Document(
        DocumentId.create('22222222-e29b-41d4-a716-446655440222'),
        bookId,
        ContentId.create('33333333-e29b-41d4-a716-446655440333'),
        YjsStateId.create('11111111-e29b-41d4-a716-446655440111'),
        MimeType.create('text/asciidoc'),
      ),
    );
    await fileStore.write(projectId, FilePath.create('/book.adoc'), Buffer.from('= Book\n\n[[ondisk]]\n== H\n'));
    const warnings: string[] = [];
    const logger = { warn: (m: string) => warnings.push(m), info: () => {}, error: () => {}, debug: () => {} } as never;
    // null = no live source (a record with no live room/persisted state); this is normal, not an error.
    const nullReader: CollaborativeContentReader = {
      async readContent(): Promise<Result<string | null, Error>> {
        return { success: true, value: null };
      },
    };
    const useCaseNull = new FindReferencesUseCase(memberRepo, fileNodeRepo, fileStore, documentRepo, nullReader, logger);

    const result = await useCaseNull.execute(actorId, projectId, 'ondisk');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toHaveLength(1); // found from the file store
    expect(warnings).toHaveLength(0); // null is normal — no warning
  });
});
