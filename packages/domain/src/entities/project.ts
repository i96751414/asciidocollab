import { ProjectId } from '../value-objects/project-id';
import { ProjectName } from '../value-objects/project-name';
import { UserId } from '../value-objects/user-id';
import { FileNodeId } from '../value-objects/file-node-id';
import { Timestamps } from '../value-objects/timestamps';

/**
 * Represents an AsciiDoc collaboration project.
 *
 * A Project aggregates file tree, documents, members, and settings. It is
 * owned by a single user and may be archived to indicate it is no longer
 * actively edited. Tags are deduplicated and limited to 10 items.
 *
 * @invariant Tags are deduplicated on construction and must not exceed 10.
 * @invariant `archivedAt` must be >= `createdAt` when provided.
 */
export class Project {
  private _rootFolderId: FileNodeId | null;
  private _archivedAt: Date | null;
  private _timestamps: Timestamps;
  private readonly _tags: readonly string[];

  constructor(
    /** Unique identifier for the project. */
    public readonly id: ProjectId,
    /** Human-readable project name. */
    public readonly name: ProjectName,
    /** Optional long-form description of the project. */
    public readonly description: string | null,
    /** Identifier of the user who owns this project. */
    public readonly ownerId: UserId,
    /**
     * Categorisation tags for the project. Duplicates are removed, and the
     * resulting array must not exceed 10 items.
     */
    tags: string[],
    /** Identifier of the root tree node, or null if no file tree has been
     *  initialised yet. */
    initialRootFolderId: FileNodeId | null,
    /** Creation and last-update timestamps. Defaults to the current time. */
    timestamps: Timestamps = new Timestamps(),
    /** Timestamp of archiving, or null if the project is active. Must be >=
     *  `createdAt`. */
    initialArchivedAt: Date | null = null,
  ) {
    this._tags = [...new Set(tags)];
    if (this._tags.length > 10) {
      throw new Error('Tags must not exceed 10 items');
    }

    if (initialArchivedAt !== null && timestamps.createdAt > initialArchivedAt) {
      throw new Error('archivedAt must be >= createdAt');
    }

    this._rootFolderId = initialRootFolderId;
    this._archivedAt = initialArchivedAt;
    this._timestamps = timestamps;
  }

  get rootFolderId(): FileNodeId | null {
    return this._rootFolderId;
  }

  get tags(): readonly string[] {
    return this._tags;
  }

  get archivedAt(): Date | null {
    return this._archivedAt;
  }

  get createdAt(): Date {
    return this._timestamps.createdAt;
  }

  get updatedAt(): Date {
    return this._timestamps.updatedAt;
  }

  /** Assigns the root folder node for the project's file tree.
   *  @param folderId - The file-node identifier of the root folder. */
  setRootFolderId(folderId: FileNodeId): void {
    this._rootFolderId = folderId;
  }

  /**
   * Marks the project as archived at the current time and bumps the update
   * timestamp.
   * @throws {Error} If the project is already archived.
   */
  archive(): void {
    if (this._archivedAt !== null) {
      throw new Error('Project is already archived');
    }
    this._archivedAt = new Date();
    this._timestamps = new Timestamps(this._timestamps.createdAt, new Date());
  }
}
