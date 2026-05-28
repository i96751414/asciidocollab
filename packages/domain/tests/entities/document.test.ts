import { Document } from '../../src/entities/document';
import { DocumentId } from '../../src/value-objects/document-id';
import { FileNodeId } from '../../src/value-objects/file-node-id';
import { ContentId } from '../../src/value-objects/content-id';
import { YjsStateId } from '../../src/value-objects/yjs-state-id';
import { MimeType } from '../../src/value-objects/mime-type';
import { Timestamps } from '../../src/value-objects/timestamps';

describe('Document entity', () => {
  const documentId = DocumentId.create('550e8400-e29b-41d4-a716-446655440000');
  const fileNodeId = FileNodeId.create('550e8400-e29b-41d4-a716-446655440001');
  const contentId = ContentId.create('550e8400-e29b-41d4-a716-446655440002');
  const yjsStateId = YjsStateId.create('550e8400-e29b-41d4-a716-446655440003');

  test('creates with all fields', () => {
    const document = new Document(documentId, fileNodeId, contentId, yjsStateId, MimeType.create('text/asciidoc'));
    expect(document.id).toBe(documentId);
    expect(document.fileNodeId).toBe(fileNodeId);
    expect(document.contentId).toBe(contentId);
    expect(document.yjsStateId).toBe(yjsStateId);
  });

  test('stores mimeType', () => {
    const document = new Document(documentId, fileNodeId, contentId, yjsStateId, MimeType.create('text/asciidoc'));
    expect(document.mimeType.value).toBe('text/asciidoc');
  });

  test('accepts different mime types', () => {
    const document1 = new Document(documentId, fileNodeId, contentId, yjsStateId, MimeType.create('text/asciidoc'));
    const document2 = new Document(
      DocumentId.create('550e8400-e29b-41d4-a716-446655440010'),
      FileNodeId.create('550e8400-e29b-41d4-a716-446655440011'),
      contentId,
      yjsStateId,
      MimeType.create('text/markdown'),
    );
    expect(document1.mimeType.value).toBe('text/asciidoc');
    expect(document2.mimeType.value).toBe('text/markdown');
  });

  test('two documents can share the same fileNodeId', () => {
    const document1 = new Document(documentId, fileNodeId, contentId, yjsStateId, MimeType.create('text/asciidoc'));
    const document2 = new Document(
      DocumentId.create('550e8400-e29b-41d4-a716-446655440010'),
      fileNodeId,
      ContentId.create('550e8400-e29b-41d4-a716-446655440020'),
      YjsStateId.create('550e8400-e29b-41d4-a716-446655440030'),
      MimeType.create('text/asciidoc'),
    );
    expect(document1.fileNodeId).toBe(document2.fileNodeId);
    expect(document1.id).not.toBe(document2.id);
  });

  test('rejects invalid MimeType', () => {
    expect(() => MimeType.create('')).toThrow();
  });

  test('rejects contentId and yjsStateId with same raw UUID value', () => {
    const sameUuid = '550e8400-e29b-41d4-a716-446655440099';
    expect(
      () => new Document(
        documentId,
        fileNodeId,
        ContentId.create(sameUuid),
        YjsStateId.create(sameUuid),
        MimeType.create('text/asciidoc'),
      ),
    ).toThrow();
  });

  test('creates with timestamps', () => {
    const document = new Document(documentId, fileNodeId, contentId, yjsStateId, MimeType.create('text/asciidoc'));
    expect(document.createdAt).toBeInstanceOf(Date);
    expect(document.updatedAt).toBeInstanceOf(Date);
  });

  test('rejects createdAt > updatedAt', () => {
    const future = new Date('2025-01-02');
    const past = new Date('2025-01-01');
    expect(
      () => new Document(documentId, fileNodeId, contentId, yjsStateId, MimeType.create('text/asciidoc'), new Timestamps(future, past)),
    ).toThrow();
  });
});
