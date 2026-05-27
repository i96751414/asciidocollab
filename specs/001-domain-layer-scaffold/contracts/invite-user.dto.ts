interface InviteUserRequest {
  projectId: string;
  userEmail: string;
  role: 'viewer' | 'editor' | 'administrator';
  invitedByUserId: string;
}

interface InviteUserResponse {
  projectId: string;
  userId: string;
}
