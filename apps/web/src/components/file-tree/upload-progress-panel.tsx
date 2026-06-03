'use client';
import { useEffect } from 'react';
import { CheckCircle2, XCircle, Loader2, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { UploadProgress } from '@/hooks/use-drop-upload';

interface Properties {
  progress: UploadProgress[];
  onDismiss: () => void;
}

/** Displays an overlay panel showing per-file upload progress with status icons. */
export function UploadProgressPanel({ progress, onDismiss }: Properties) {
  const total = progress.length;
  const completedCount = progress.filter((p) => p.status === 'done' || p.status === 'error').length;
  const doneCount = progress.filter((p) => p.status === 'done').length;
  const hasError = progress.some((p) => p.status === 'error');
  const allFinished = completedCount === total && total > 0;
  const allSuccess = allFinished && !hasError;

  useEffect(() => {
    if (!allSuccess) return;
    const timer = setTimeout(onDismiss, 2000);
    return () => clearTimeout(timer);
  }, [allSuccess, onDismiss]);

  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="absolute bottom-2 left-2 right-2 rounded-md border bg-background p-3 shadow-lg z-10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{doneCount} / {total} files</span>
        {hasError && (
          <button
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <Progress value={pct} className="mb-2" />

      <ul
        data-testid="items-list"
        className="space-y-1"
        style={{ overflowY: 'auto', maxHeight: '16rem' }}
      >
        {progress.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-sm">
            {item.status === 'uploading' && (
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="uploading" />
            )}
            {item.status === 'done' && (
              <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="done" />
            )}
            {item.status === 'error' && (
              <XCircle className="h-4 w-4 text-destructive" aria-label={`failed: ${item.errorMessage}`} />
            )}
            {item.status === 'pending' && (
              <div className="h-4 w-4 rounded-full border border-muted-foreground" aria-label="pending" />
            )}
            <span className="flex-1 truncate">{item.name}</span>
            {item.status === 'error' && item.errorMessage && (
              <span className="text-xs text-destructive truncate max-w-[120px]">{item.errorMessage}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
