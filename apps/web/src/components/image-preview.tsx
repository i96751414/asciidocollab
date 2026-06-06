'use client';
import { useState, useEffect } from 'react';
import { fileContentUrl } from '@/lib/api/file-content';

interface ImagePreviewProperties {
  projectId: string;
  fileNodeId: string;
  fileName: string;
}

/** Fetches a binary asset and renders it as an image using a temporary object URL. */
export function ImagePreview({ projectId, fileNodeId, fileName }: ImagePreviewProperties) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let createdUrl: string | null = null;
    const controller = new AbortController();

    fetch(fileContentUrl(projectId, fileNodeId), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((res) => res.blob())
      .then((blob) => {
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError('Failed to load image.');
      });

    return () => {
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [projectId, fileNodeId]);

  if (error) {
    return <p className="text-destructive text-sm p-4">{error}</p>;
  }

  if (!objectUrl) {
    return (
      <div className="p-4">
        <div className="h-32 w-full bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full p-4 overflow-auto">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={objectUrl} alt={fileName} className="max-w-full max-h-full object-contain" />
    </div>
  );
}
