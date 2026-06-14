import type { FileTreeNode } from '@/components/file-tree/types';

/** Bidirectional id↔path maps for the files in a project tree (paths project-relative). */
export interface FilePathIndex {
  /** Maps a file id to its project-relative path. */
  pathById: Map<string, string>;
  /** Maps a project-relative path back to its file id. */
  idByPath: Map<string, string>;
}

/** Flatten a file tree into id↔path maps (files only; paths normalized to project-relative). */
function collectFilePaths(
  node: FileTreeNode,
  pathById: Map<string, string>,
  idByPath: Map<string, string>,
): void {
  if (node.type === 'file') {
    const path = node.path.replace(/^\/+/, '');
    pathById.set(node.id, path);
    idByPath.set(path, node.id);
  }
  for (const child of node.children) collectFilePaths(child, pathById, idByPath);
}

/**
 * Build bidirectional id↔path maps from a project file tree (files only).
 *
 * @param root - Root node of the project file tree.
 * @returns The {@link FilePathIndex} covering every file in the tree.
 */
export function buildFilePathIndex(root: FileTreeNode): FilePathIndex {
  const pathById = new Map<string, string>();
  const idByPath = new Map<string, string>();
  collectFilePaths(root, pathById, idByPath);
  return { pathById, idByPath };
}
