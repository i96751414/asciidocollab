import { Asset } from '../../src/entities/asset';
import { FileNodeId } from '../../src/value-objects/ids/file-node-id';
import { MimeType } from '../../src/value-objects/files/mime-type';

describe('Asset entity', () => {
  const fileNodeId = FileNodeId.create('550e8400-e29b-41d4-a716-446655440000');
  const uploadedAt = new Date('2026-05-26T12:00:00Z');

  test('creates with all fields', () => {
    const asset = new Asset(fileNodeId, MimeType.create('image/png'), 1024n, uploadedAt, null);
    expect(asset.id).toBe(fileNodeId);
    expect(asset.mimeType.value).toBe('image/png');
    expect(asset.sizeBytes).toBe(1024n);
    expect(asset.uploadedAt).toBe(uploadedAt);
    expect(asset.updatedAt).toBeNull();
  });

  test('rejects sizeBytes < 0', () => {
    expect(() => new Asset(fileNodeId, MimeType.create('image/png'), -1n, uploadedAt, null)).toThrow();
  });

  test('accepts sizeBytes = 0 (zero-byte file)', () => {
    const asset = new Asset(fileNodeId, MimeType.create('image/png'), 0n, uploadedAt, null);
    expect(asset.sizeBytes).toBe(0n);
  });

  test('accepts sizeBytes > 0', () => {
    const asset = new Asset(fileNodeId, MimeType.create('image/png'), 1n, uploadedAt, null);
    expect(asset.sizeBytes).toBe(1n);
  });

  test('uploadedAt defaults to now when omitted', () => {
    const before = new Date();
    const asset = new Asset(fileNodeId, MimeType.create('image/png'), 100n);
    const after = new Date();
    expect(asset.uploadedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(asset.uploadedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  test('updatedAt is null by default', () => {
    const asset = new Asset(fileNodeId, MimeType.create('image/png'), 100n, uploadedAt, null);
    expect(asset.updatedAt).toBeNull();
  });
});
