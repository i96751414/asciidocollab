interface ChangeMemberRoleRequest {
  projectId: string;
  userId: string;
  newRole: 'viewer' | 'editor' | 'administrator';
  requestedByUserId: string;
}

interface ChangeMemberRoleResponse {
  userId: string;
  newRole: 'viewer' | 'editor' | 'administrator';
}
