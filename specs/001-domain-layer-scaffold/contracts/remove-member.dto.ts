interface RemoveMemberRequest {
  projectId: string;
  userId: string; // UUID of member to remove
  requestedByUserId: string; // UUID of actor
}

interface RemoveMemberResponse {
  removedUserId: string; // UUID
}
