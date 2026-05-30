/**
 * DTO for listing user projects response.
 */
export interface ListUserProjectsResultDto {
  /** List of projects for the current page. */
  projects: ProjectDto[];
  /** Total number of matching projects. */
  total: number;
  /** Current page number. */
  page: number;
  /** Number of items per page. */
  limit: number;
  /** Total number of pages. */
  totalPages: number;
}

/**
 * DTO for updating a project request.
 */
export interface UpdateProjectDto {
  /** New project name. */
  name?: string;
  /** New project description. */
  description?: string | null;
  /** New project tags. */
  tags?: string[];
}

/**
 * DTO for archiving a project response.
 */
export interface ArchiveProjectResultDto {
  /** Unique project identifier. */
  id: string;
  /** Archive timestamp. */
  archivedAt: string;
}

/**
 * DTO for restoring a project response.
 */
export interface RestoreProjectResultDto {
  /** Unique project identifier. */
  id: string;
  /** Always null after restore. */
  archivedAt: null;
}

/**
 * DTO for project data.
 */
export interface ProjectDto {
  /** Unique project identifier. */
  id: string;
  /** Display name of the project. */
  name: string;
  /** Optional project description. */
  description: string | null;
  /** User ID of the project owner. */
  ownerId: string;
  /** Display name of the project owner. */
  ownerName: string;
  /** Categorization tags. */
  tags: string[];
  /** Root folder identifier. */
  rootFolderId: string | null;
  /** Archive timestamp, null if not archived. */
  archivedAt: string | null;
  /** Number of project members. */
  memberCount?: number;
  /** Current user's role in the project. */
  role?: 'viewer' | 'editor' | 'administrator';
  /** Creation timestamp. */
  createdAt: string;
  /** Last update timestamp. */
  updatedAt: string;
}
