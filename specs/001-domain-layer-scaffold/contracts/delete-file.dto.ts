interface DeleteFileRequest {
  fileNodeId: string; // UUID
  projectId: string; // UUID, for authorization context
  requestedByUserId: string; // UUID
}

interface DeleteFileResponse {
  deletedFileNodeId: string; // UUID
}
