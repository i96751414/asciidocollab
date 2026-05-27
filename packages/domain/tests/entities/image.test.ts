import { Image } from '../../src/entities/image';
import { ImageId } from '../../src/value-objects/image-id';
import { ProjectId } from '../../src/value-objects/project-id';
import { MimeType } from '../../src/value-objects/mime-type';

describe('Image entity', () => {
  const imgId = ImageId.create('550e8400-e29b-41d4-a716-446655440000');
  const projectId = ProjectId.create('550e8400-e29b-41d4-a716-446655440001');
  const uploadedAt = new Date('2026-05-26T12:00:00Z');

  test('creates with all fields', () => {
    const img = new Image(
      imgId,
      projectId,
      'logo.png',
      '/uploads/logo.png',
      MimeType.create('image/png'),
      1024,
      null,
      uploadedAt,
      null,
    );
    expect(img.id).toBe(imgId);
    expect(img.projectId).toBe(projectId);
    expect(img.filename).toBe('logo.png');
    expect(img.storagePath).toBe('/uploads/logo.png');
    expect(img.mimeType.value).toBe('image/png');
    expect(img.sizeBytes).toBe(1024);
    expect(img.parentId).toBeNull();
    expect(img.uploadedAt).toBe(uploadedAt);
    expect(img.updatedAt).toBeNull();
  });

  test('rejects sizeBytes <= 0', () => {
    expect(() => new Image(imgId, projectId, 'img.png', '/img.png', MimeType.create('image/png'), 0, null, uploadedAt, null)).toThrow();
    expect(() => new Image(imgId, projectId, 'img.png', '/img.png', MimeType.create('image/png'), -1, null, uploadedAt, null)).toThrow();
  });

  test('accepts sizeBytes > 0', () => {
    const img = new Image(imgId, projectId, 'img.png', '/img.png', MimeType.create('image/png'), 1, null, uploadedAt, null);
    expect(img.sizeBytes).toBe(1);
  });

  test('version chain via parentId', () => {
    const v1 = ImageId.create('550e8400-e29b-41d4-a716-446655440010');
    const v2Id = ImageId.create('550e8400-e29b-41d4-a716-446655440011');
    const v2 = new Image(v2Id, projectId, 'logo.png', '/uploads/logo.png', MimeType.create('image/png'), 2048, v1, uploadedAt, new Date());
    expect(v2.parentId).toBe(v1);
    expect(v2.parentId).not.toBeNull();
  });

  test('uploadedAt is set on creation', () => {
    const now = new Date();
    const img = new Image(imgId, projectId, 'img.png', '/img.png', MimeType.create('image/png'), 100, null, now, null);
    expect(img.uploadedAt).toBe(now);
  });

  test('updatedAt is null initially and set on update', () => {
    const img = new Image(imgId, projectId, 'img.png', '/img.png', MimeType.create('image/png'), 100, null, uploadedAt, null);
    expect(img.updatedAt).toBeNull();
  });
});
