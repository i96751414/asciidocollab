'use client';
import { useState, useCallback, ReactNode } from 'react';
import { cn } from '@/lib/utilities';
import { useDropUpload } from '@/hooks/use-drop-upload';
import { UploadProgressPanel } from './upload-progress-panel';

interface Properties {
  targetFolderId: string;
  projectId: string;
  children: ReactNode;
  className?: string;
}

/** Wraps content in a drag-and-drop zone that uploads dropped files into the target folder. */
export function DragDropZone({ targetFolderId, projectId, children, className }: Properties) {
  const [isDragging, setIsDragging] = useState(false);
  const { onDrop, progress } = useDropUpload(targetFolderId, projectId);
  const [currentProgress, setCurrentProgress] = useState(progress);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer?.items) {
      onDrop(event.dataTransfer.items);
    }
  }, [onDrop]);

  const clearProgress = useCallback(() => {
    setCurrentProgress([]);
  }, []);

  // Sync external progress changes
  const displayProgress = progress.length > 0 ? progress : currentProgress;

  return (
    <div
      className={cn(
        'relative',
        isDragging && 'ring-2 ring-primary ring-inset',
        className,
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {displayProgress.length > 0 && (
        <UploadProgressPanel progress={displayProgress} onDismiss={clearProgress} />
      )}
    </div>
  );
}
