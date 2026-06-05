import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api/file-tree';

interface TreeNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
  parentId: string | null;
  children: TreeNode[];
}

function flattenPaths(node: TreeNode): string[] {
  if (node.type === 'file') {
    return [node.path.replace(/^\//, '')];
  }
  return node.children.flatMap(flattenPaths);
}

/** Fetches and flattens the project file tree into a list of relative paths. */
export function useIncludeCompletions(projectId: string): string[] {
  const [paths, setPaths] = useState<string[]>([]);

  useEffect(() => {
    async function fetchPaths() {
      try {
        const response = await fetch(`${API_BASE_URL}/projects/${projectId}/files`, {
          credentials: 'include',
        });
        if (!response.ok) return;
        const tree: TreeNode = await response.json();
        setPaths(flattenPaths(tree));
      } catch { /* non-fatal */ }
    }

    void fetchPaths();
  }, [projectId]);

  return paths;
}
