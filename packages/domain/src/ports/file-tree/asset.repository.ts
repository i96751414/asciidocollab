import { Asset } from '../../entities/asset';
import { FileNodeId } from '../../value-objects/file-node-id';

/**
 * Repository interface for managing Asset persistence.
 *
 * Asset.id is a foreign key to FileNode.id (1:1). Uniqueness of the
 * storage path within a project is guaranteed by the FileNode path
 * uniqueness constraint — the Asset layer does not duplicate projectId
 * or storagePath.
 */
export interface AssetRepository {
  /**
   * Finds an asset by its FileNode id.
   *
   * @param id - The FileNode id that owns the asset.
   * @returns The asset if found, null otherwise.
   */
  findById(id: FileNodeId): Promise<Asset | null>;

  /**
   * Persists an asset entity.
   *
   * @param asset - The asset entity to save.
   * @throws If an asset with the same id already exists (1:1 FK constraint).
   */
  save(asset: Asset): Promise<void>;

  /**
   * Removes an asset by its FileNode id.
   *
   * @param id - The FileNode id of the asset to delete.
   */
  delete(id: FileNodeId): Promise<void>;
}
