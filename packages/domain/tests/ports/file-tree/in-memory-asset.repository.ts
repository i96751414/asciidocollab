import { Asset } from '../../../src/entities/asset';
import { AssetId } from '../../../src/value-objects/asset-id';
import { ProjectId } from '../../../src/value-objects/project-id';
import { AssetRepository } from '../../../src/ports/file-tree/asset.repository';

/** In-memory implementation of AssetRepository for use in tests. */
export class InMemoryAssetRepository implements AssetRepository {
  private readonly storage = new Map<string, Asset>();

  /** Returns the asset with the given ID, or null if not found. */
  async findById(id: AssetId): Promise<Asset | null> {
    return this.storage.get(id.value) ?? null;
  }

  /** Returns all assets belonging to the given project. */
  async findByProjectId(projectId: ProjectId): Promise<Asset[]> {
    return [...this.storage.values()].filter(
      (asset) => asset.projectId.value === projectId.value,
    );
  }

  /** Stores an asset in memory, overwriting any existing entry with the same ID. */
  async save(asset: Asset): Promise<void> {
    this.storage.set(asset.id.value, asset);
  }

  /** Returns the asset whose storagePath matches within the given project, or null. */
  async findByStoragePath(projectId: ProjectId, storagePath: string): Promise<Asset | null> {
    for (const asset of this.storage.values()) {
      if (asset.projectId.value === projectId.value && asset.storagePath === storagePath) {
        return asset;
      }
    }
    return null;
  }

  /** Removes the asset with the given ID from memory. */
  async delete(id: AssetId): Promise<void> {
    this.storage.delete(id.value);
  }
}
