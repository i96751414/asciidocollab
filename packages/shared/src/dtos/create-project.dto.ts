/** Input data for creating a new project. */
export interface CreateProjectDto {
  /**
   *
   */
  actorId: string;
  /**
   *
   */
  name: string;
  /**
   *
   */
  description: string | null;
  /**
   *
   */
  initialTags: string[];
}

/** Output data returned after a project is created. */
export interface CreateProjectResultDto {
  /**
   *
   */
  projectId: string;
  /**
   *
   */
  rootFolderId: string;
  /**
   *
   */
  ownerId: string;
  /**
   *
   */
  ownerRole: 'administrator';
}
