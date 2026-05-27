// Input: CreateProjectRequest
interface CreateProjectRequest {
  name: string;
  description?: string;
  ownerId: string; // UUID
  tags?: string[];
}

// Output: CreateProjectResponse
interface CreateProjectResponse {
  projectId: string; // UUID
  rootFolderId: string; // UUID
  ownerId: string; // UUID
  ownerRole: 'administrator'; // Owner is always an administrator per domain invariant
}
