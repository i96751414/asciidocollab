'use client';
import { useState } from 'react';
import Image from 'next/image';
import { fileContentUrl } from '@/lib/api/file-content';
import { Skeleton } from '@/components/ui/skeleton';

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
      <div className="relative w-full h-full">
        <Image
          src={fileContentUrl(projectId, fileNodeId)}
          alt={fileName}
          unoptimized
          fill
          crossOrigin="use-credentials"
          className="object-contain"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Skeleton className="w-48 h-48" />
          </div>
        )}
      </div>
    </div>
  );
}
