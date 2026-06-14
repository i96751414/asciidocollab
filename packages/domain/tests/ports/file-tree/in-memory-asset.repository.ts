import { Asset } from '../../../src/entities/asset';
import { FileNodeId } from '../../../src/value-objects/ids/file-node-id';
import { AssetRepository } from '../../../src/ports/file-tree/asset.repository';

/** In-memory implementation of AssetRepository for use in tests. */
export class InMemoryAssetRepository implements AssetRepository {
  private readonly storage = new Map<string, Asset>();

  /** Returns the asset with the given FileNode id, or null if not found. */
  async findById(id: FileNodeId): Promise<Asset | null> {
    return this.storage.get(id.value) ?? null;
  }

  /**
   * Inserts the asset. Throws if an asset with the same FileNode id already
   * exists, mirroring the database-level PK + FK uniqueness constraint.
   */
  async save(asset: Asset): Promise<void> {
    if (this.storage.has(asset.id.value)) {
      throw new Error(
        `Asset for FileNode ${asset.id.value} already exists — Asset.id is a unique FK to FileNode.id`,
      );
    }
    this.storage.set(asset.id.value, asset);
  }

  /** Removes the asset with the given FileNode id from memory. */
  async delete(id: FileNodeId): Promise<void> {
    this.storage.delete(id.value);
  }
}
