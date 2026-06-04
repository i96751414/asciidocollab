'use client';
import { useState, useCallback } from 'react';
import { walkEntries } from '../lib/fs-entry-walker';
import { uploadAsset } from '../lib/api/assets';
import { createFolder, FileTreeApiError } from '../lib/api/file-tree';

/** Status of a single upload item in the progress panel. */
export type UploadItemStatus = 'pending' | 'uploading' | 'done' | 'error';

/** Tracks progress of a single file being uploaded as part of a drop operation. */
export interface UploadProgress {
  /** Unique identifier for this upload item. */
  id: string;
  /** Display name of the file being uploaded. */
  name: string;
  /** Relative path of the file within the dropped directory structure. */
  relativePath: string;
  /** Current upload status. */
  status: UploadItemStatus;
  /** Error message if status is 'error'. */
  errorMessage?: string;
}

/** React hook that handles drag-and-drop file uploads into a project folder. */
export function useDropUpload(targetFolderId: string, projectId: string, onComplete?: () => void) {
  const [progress, setProgress] = useState<UploadProgress[]>([]);

  const updateItem = useCallback((id: string, update: Partial<UploadProgress>) => {
    setProgress((previous) => previous.map((item) => (item.id === id ? { ...item, ...update } : item)));
  }, []);

  const onDrop = useCallback(async (items: DataTransferItemList) => {
    const entries: Array<{ file: File; relativePath: string }> = [];
    for await (const entry of walkEntries(items)) {
      entries.push(entry);
    }

    const initialProgress: UploadProgress[] = entries.map((entry) => ({
      id: crypto.randomUUID(),
      name: entry.file.name,
      relativePath: entry.relativePath,
      status: 'pending',
    }));
    setProgress(initialProgress);

    // Create all intermediate folders depth-first before uploading files
    const folderCache = new Map<string, string>([['', targetFolderId]]);

    const getOrCreateFolder = async (folderPath: string): Promise<string> => {
      if (folderCache.has(folderPath)) return folderCache.get(folderPath)!;

      const parts = folderPath.split('/');
      const name = parts.at(-1) ?? folderPath;
      const parentPath = parts.slice(0, -1).join('/');
      const parentId = await getOrCreateFolder(parentPath);

      try {
        const result = await createFolder(projectId, parentId, name);
        folderCache.set(folderPath, result.fileNodeId);
        return result.fileNodeId;
      } catch (error) {
        if (error instanceof FileTreeApiError && error.status === 409) {
          const resolvedId = error.existingFileNodeId ?? parentId;
          folderCache.set(folderPath, resolvedId);
          return resolvedId;
        }
        throw error;
      }
    };

    // Pre-create all folder paths
    const folderPaths = new Set<string>();
    for (const { relativePath } of entries) {
      const parts = relativePath.split('/');
      for (let index = 1; index < parts.length; index++) {
        folderPaths.add(parts.slice(0, index).join('/'));
      }
    }
    for (const folderPath of [...folderPaths].toSorted()) {
      await getOrCreateFolder(folderPath);
    }

    // Upload files
    for (const [index, { file, relativePath }] of entries.entries()) {
      const item = initialProgress[index];
      updateItem(item.id, { status: 'uploading' });

      const parts = relativePath.split('/');
      const parentPath = parts.slice(0, -1).join('/');
      const parentId = folderCache.get(parentPath) ?? targetFolderId;

      try {
        await uploadAsset(projectId, parentId, file);
        updateItem(item.id, { status: 'done' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        updateItem(item.id, { status: 'error', errorMessage: message });
      }
    }

    onComplete?.();
  }, [targetFolderId, projectId, updateItem, onComplete]);

  const clearProgress = useCallback(() => {
    setProgress([]);
  }, []);

  return { onDrop, progress, clearProgress };
}
