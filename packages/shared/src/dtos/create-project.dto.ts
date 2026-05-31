/** Input data for creating a new project. */
export interface CreateProjectDto {
  /** ID of the user creating the project. */
  actorId: string;
  /** Human-readable name for the new project. */
  name: string;
  /** Optional description of the project's purpose, or null if not provided. */
  description: string | null;
  /** List of tags to attach to the project upon creation. */
  initialTags: string[];
}

/** Output data returned after a project is created. */
export interface CreateProjectResultDto {
  /** ID of the newly created project. */
  projectId: string;
  /** ID of the root folder node automatically created with the project. */
  rootFolderId: string;
  /** Role assigned to the creator of the project. */
  ownerRole: 'owner';
}
