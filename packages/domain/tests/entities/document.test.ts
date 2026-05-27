import { Document } from '../../src/entities/document';
import { DocumentId } from '../../src/value-objects/document-id';
import { FileNodeId } from '../../src/value-objects/file-node-id';
import { ContentId } from '../../src/value-objects/content-id';
import { YjsStateId } from '../../src/value-objects/yjs-state-id';
import { MimeType } from '../../src/value-objects/mime-type';
import { Timestamps } from '../../src/value-objects/timestamps';

describe('Document entity', () => {
  const docId = DocumentId.create('550e8400-e29b-41d4-a716-446655440000');
  const fileNodeId = FileNodeId.create('550e8400-e29b-41d4-a716-446655440001');
  const contentId = ContentId.create('550e8400-e29b-41d4-a716-446655440002');
  const yjsStateId = YjsStateId.create('550e8400-e29b-41d4-a716-446655440003');

  test('creates with all fields', () => {
    const doc = new Document(docId, fileNodeId, contentId, yjsStateId, MimeType.create('text/asciidoc'));
    expect(doc.id).toBe(docId);
    expect(doc.fileNodeId).toBe(fileNodeId);
    expect(doc.contentId).toBe(contentId);
    expect(doc.yjsStateId).toBe(yjsStateId);
  });

  test('stores mimeType', () => {
    const doc = new Document(docId, fileNodeId, contentId, yjsStateId, MimeType.create('text/asciidoc'));
    expect(doc.mimeType.value).toBe('text/asciidoc');
  });

  test('accepts different mime types', () => {
    const doc1 = new Document(docId, fileNodeId, contentId, yjsStateId, MimeType.create('text/asciidoc'));
    const doc2 = new Document(
      DocumentId.create('550e8400-e29b-41d4-a716-446655440010'),
      FileNodeId.create('550e8400-e29b-41d4-a716-446655440011'),
      contentId,
      yjsStateId,
      MimeType.create('text/markdown'),
    );
    expect(doc1.mimeType.value).toBe('text/asciidoc');
    expect(doc2.mimeType.value).toBe('text/markdown');
  });

  test('two documents can share the same fileNodeId', () => {
    const doc1 = new Document(docId, fileNodeId, contentId, yjsStateId, MimeType.create('text/asciidoc'));
    const doc2 = new Document(
      DocumentId.create('550e8400-e29b-41d4-a716-446655440010'),
      fileNodeId,
      ContentId.create('550e8400-e29b-41d4-a716-446655440020'),
      YjsStateId.create('550e8400-e29b-41d4-a716-446655440030'),
      MimeType.create('text/asciidoc'),
    );
    expect(doc1.fileNodeId).toBe(doc2.fileNodeId);
    expect(doc1.id).not.toBe(doc2.id);
  });

  test('rejects invalid MimeType', () => {
    expect(() => MimeType.create('')).toThrow();
  });

  test('rejects contentId and yjsStateId with same raw UUID value', () => {
    const sameUuid = '550e8400-e29b-41d4-a716-446655440099';
    expect(
      () => new Document(
        docId,
        fileNodeId,
        ContentId.create(sameUuid),
        YjsStateId.create(sameUuid),
        MimeType.create('text/asciidoc'),
      ),
    ).toThrow();
  });

  test('creates with timestamps', () => {
    const doc = new Document(docId, fileNodeId, contentId, yjsStateId, MimeType.create('text/asciidoc'));
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
  });

  test('rejects createdAt > updatedAt', () => {
    const future = new Date('2025-01-02');
    const past = new Date('2025-01-01');
    expect(
      () => new Document(docId, fileNodeId, contentId, yjsStateId, MimeType.create('text/asciidoc'), new Timestamps(future, past)),
    ).toThrow();
  });
});
