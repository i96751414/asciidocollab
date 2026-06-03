import { Asset } from '../entities/asset';
import { AssetId } from '../value-objects/asset-id';
import { ProjectId } from '../value-objects/project-id';

/**
 * Repository interface for managing Asset persistence.
 * Handles storage and retrieval of uploaded file asset metadata within projects.
 */
export interface AssetRepository {
  /**
   * Finds an asset by its unique identifier.
   *
   * @param id - The unique identifier of the asset.
   * @returns The asset if found, null otherwise.
   */
  findById(id: AssetId): Promise<Asset | null>;

  /**
   * Finds all assets belonging to a given project.
   *
   * @param projectId - The unique identifier of the project.
   * @returns An array of assets in the project.
   */
  findByProjectId(projectId: ProjectId): Promise<Asset[]>;

  /**
   * Persists an asset entity (create or update).
   *
   * @param asset - The asset entity to save.
   * @returns A promise that resolves when the operation completes.
   */
  save(asset: Asset): Promise<void>;

  /**
   * Removes an asset by its unique identifier.
   *
   * @param id - The unique identifier of the asset to delete.
   * @returns A promise that resolves when the operation completes.
   */
  delete(id: AssetId): Promise<void>;
}
