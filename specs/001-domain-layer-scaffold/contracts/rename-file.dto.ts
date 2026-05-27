interface RenameFileRequest {
  fileNodeId: string; // UUID
  projectId: string; // UUID, for authorization context
  newName: string;
  requestedByUserId: string; // UUID
}

interface RenameFileResponse {
  fileNodeId: string;
  newName: string;
  newPath: string; // Updated materialized path
}
