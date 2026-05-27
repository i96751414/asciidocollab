interface GetProjectTreeRequest {
  projectId: string;
  userId: string;
}

interface FileTreeNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType?: string; // Present for type=file nodes
  children?: FileTreeNode[];
}

interface GetProjectTreeResponse {
  root: FileTreeNode;
}
