import { Asset } from '../../src/entities/asset';
import { AssetId } from '../../src/value-objects/asset-id';
import { ProjectId } from '../../src/value-objects/project-id';
import { MimeType } from '../../src/value-objects/mime-type';

describe('Asset entity', () => {
  const assetId = AssetId.create('550e8400-e29b-41d4-a716-446655440000');
  const projectId = ProjectId.create('550e8400-e29b-41d4-a716-446655440001');
  const uploadedAt = new Date('2026-05-26T12:00:00Z');

  test('creates with all fields', () => {
    const asset = new Asset(
      assetId,
      projectId,
      'logo.png',
      '/uploads/logo.png',
      MimeType.create('image/png'),
      1024,
      null,
      uploadedAt,
      null,
    );
    expect(asset.id).toBe(assetId);
    expect(asset.projectId).toBe(projectId);
    expect(asset.filename).toBe('logo.png');
    expect(asset.storagePath).toBe('/uploads/logo.png');
    expect(asset.mimeType.value).toBe('image/png');
    expect(asset.sizeBytes).toBe(1024);
    expect(asset.parentId).toBeNull();
    expect(asset.uploadedAt).toBe(uploadedAt);
    expect(asset.updatedAt).toBeNull();
  });

  test('rejects sizeBytes < 0', () => {
    expect(() => new Asset(assetId, projectId, 'file.png', '/file.png', MimeType.create('image/png'), -1, null, uploadedAt, null)).toThrow();
  });

  test('accepts sizeBytes = 0 (zero-byte file)', () => {
    const asset = new Asset(assetId, projectId, 'file.png', '/file.png', MimeType.create('image/png'), 0, null, uploadedAt, null);
    expect(asset.sizeBytes).toBe(0);
  });

  test('accepts sizeBytes > 0', () => {
    const asset = new Asset(assetId, projectId, 'file.png', '/file.png', MimeType.create('image/png'), 1, null, uploadedAt, null);
    expect(asset.sizeBytes).toBe(1);
  });

  test('version chain via parentId', () => {
    const v1 = AssetId.create('550e8400-e29b-41d4-a716-446655440010');
    const v2Id = AssetId.create('550e8400-e29b-41d4-a716-446655440011');
    const v2 = new Asset(v2Id, projectId, 'logo.png', '/uploads/logo.png', MimeType.create('image/png'), 2048, v1, uploadedAt, new Date());
    expect(v2.parentId).toBe(v1);
    expect(v2.parentId).not.toBeNull();
  });

  test('uploadedAt is set on creation', () => {
    const now = new Date();
    const asset = new Asset(assetId, projectId, 'file.png', '/file.png', MimeType.create('image/png'), 100, null, now, null);
    expect(asset.uploadedAt).toBe(now);
  });

  test('updatedAt is null initially and set on update', () => {
    const asset = new Asset(assetId, projectId, 'file.png', '/file.png', MimeType.create('image/png'), 100, null, uploadedAt, null);
    expect(asset.updatedAt).toBeNull();
  });
});
