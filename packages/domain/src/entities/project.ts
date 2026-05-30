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
  private _tags: string[];
  private _name: ProjectName;
  private _description: string | null;

  /**
   * @throws {Error} If tags exceed 10 items, or `initialArchivedAt` precedes `createdAt`.
   */
  constructor(
    /** Unique identifier for the project. */
    public readonly id: ProjectId,
    /** Human-readable project name. */
    name: ProjectName,
    /** Optional long-form description of the project. */
    description: string | null,
    /** Identifier of the user who owns this project. */
    public readonly ownerId: UserId,
    /**
     * Categorisation tags for the project. Duplicates are removed, and the
     * resulting array must not exceed 10 items.
     */
    tags: string[],
    /**
     * Identifier of the root tree node, or null if no file tree has been
     *  initialised yet.
     */
    initialRootFolderId: FileNodeId | null,
    /** Creation and last-update timestamps. Defaults to the current time. */
    timestamps: Timestamps = new Timestamps(),
    /**
     * Timestamp of archiving, or null if the project is active. Must be >=
     *  `createdAt`.
     */
    initialArchivedAt: Date | null = null,
  ) {
    const deduplicatedTags = [...new Set(tags)];
    if (deduplicatedTags.length > 10) {
      throw new Error('Tags must not exceed 10 items');
    }

    if (initialArchivedAt !== null && timestamps.createdAt > initialArchivedAt) {
      throw new Error('archivedAt must be >= createdAt');
    }

    this._name = name;
    this._description = description;
    this._tags = deduplicatedTags;
    this._rootFolderId = initialRootFolderId;
    this._archivedAt = initialArchivedAt;
    this._timestamps = timestamps;
  }

  /** @returns The display name of the project. */
  get name(): ProjectName {
    return this._name;
  }

  /** @returns The optional description of the project. */
  get description(): string | null {
    return this._description;
  }

  /** @returns The root folder identifier, or null if not initialised. */
  get rootFolderId(): FileNodeId | null {
    return this._rootFolderId;
  }

  /** @returns A defensive copy of the tags array. */
  get tags(): readonly string[] {
    return [...this._tags];
  }

  /** @returns The archive timestamp, or null if active. */
  get archivedAt(): Date | null {
    return this._archivedAt;
  }

  /** @returns A defensive copy of the creation date. */
  get createdAt(): Date {
    return new Date(this._timestamps.createdAt);
  }

  /** @returns A defensive copy of the last-update date. */
  get updatedAt(): Date {
    return new Date(this._timestamps.updatedAt);
  }

  /**
   * Assigns the root folder node for the project's file tree.
   * 
   * @param folderId - The file-node identifier of the root folder.
   */
  setRootFolderId(folderId: FileNodeId): void {
    this._rootFolderId = folderId;
  }

  /**
   * Marks the project as archived at the current time and bumps the update
   * timestamp.
   * 
   * @throws {Error} If the project is already archived.
   */
  archive(): void {
    if (this._archivedAt !== null) {
      throw new Error('Project is already archived');
    }
    const now = new Date();
    this._archivedAt = now;
    this._timestamps = new Timestamps(this._timestamps.createdAt, now);
  }

  /**
   * Restores an archived project by clearing the archive timestamp.
   * Bumps the update timestamp.
   * 
   * @throws {Error} If the project is not archived.
   */
  restore(): void {
    if (this._archivedAt === null) {
      throw new Error('Project is not archived');
    }
    this._archivedAt = null;
    this._timestamps = new Timestamps(this._timestamps.createdAt, new Date());
  }

  /**
   * Updates project details and bumps the update timestamp.
   * At least one field must be provided.
   *
   * @param updates - The fields to update.
   * @throws {Error} If no fields are provided or tags exceed 10 items.
   */
  update(updates: {
    name?: ProjectName;
    description?: string | null;
    tags?: string[];
  }): void {
    if (updates.name === undefined && updates.description === undefined && updates.tags === undefined) {
      throw new Error('At least one field must be provided');
    }

    if (updates.name !== undefined) {
      this._name = updates.name;
    }

    if (updates.description !== undefined) {
      this._description = updates.description;
    }

    if (updates.tags !== undefined) {
      const deduplicated = [...new Set(updates.tags)];
      if (deduplicated.length > 10) {
        throw new Error('Tags must not exceed 10 items');
      }
      this._tags = deduplicated;
    }

    this._timestamps = new Timestamps(this._timestamps.createdAt, new Date());
  }
}
