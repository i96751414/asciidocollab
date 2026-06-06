'use client';
import { useState } from 'react';
import { fileContentUrl } from '@/lib/api/file-content';

interface ImagePreviewProperties {
  projectId: string;
  fileNodeId: string;
  fileName: string;
}

/** Renders an image asset using a direct API URL (no fetch/blob). */
export function ImagePreview({ projectId, fileNodeId, fileName }: ImagePreviewProperties) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (error) {
    return <p className="text-destructive text-sm p-4">Failed to load image.</p>;
  }

  return (
    <div className="flex items-center justify-center h-full p-4 overflow-auto">
      {!loaded && (
        <div className="w-48 h-48 bg-muted animate-pulse rounded" data-testid="image-loading-skeleton" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={fileContentUrl(projectId, fileNodeId)}
        alt={fileName}
        crossOrigin="use-credentials"
        className={`max-w-full max-h-full object-contain${loaded ? '' : ' hidden'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  );
}
