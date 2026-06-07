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
  'data-testid'?: string;
  /** Called after all uploads in a drop batch finish (success or error). Use to refresh the tree. */
  onComplete?: () => void;
}

/** Wraps content in a drag-and-drop zone that uploads dropped files into the target folder. */
export function DragDropZone({ targetFolderId, projectId, children, className, onComplete, 'data-testid': testId }: Properties) {
  const [isDragging, setIsDragging] = useState(false);
  const { onDrop, progress, clearProgress } = useDropUpload(targetFolderId, projectId, onComplete);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (event.dataTransfer?.items) {
      onDrop(event.dataTransfer.items);
    }
  }, [onDrop]);

  return (
    <div
      data-testid={testId}
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
      {progress.length > 0 && (
        <UploadProgressPanel progress={progress} onDismiss={clearProgress} />
      )}
    </div>
  );
}
