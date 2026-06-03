'use client';
import { Skeleton } from '@/components/ui/skeleton';
import type { SelectedFile, FileContentState } from '@/hooks/use-file-selection';

interface FileContentPanelProperties {
  selectedFile: SelectedFile | null;
  contentState: FileContentState;
}

/** Renders the content of the selected file in one of five visual states: empty, loading, binary, error, or text. */
export function FileContentPanel({ selectedFile, contentState }: FileContentPanelProperties) {
  if (selectedFile === null) {
    return (
      <p className="text-muted-foreground text-sm">
        Select a file from the tree to view its content.
      </p>
    );
  }

  if (contentState.isLoading) {
    return (
      <div data-testid="content-loading" className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (contentState.isBinary) {
    return (
      <p className="text-muted-foreground text-sm">Preview not available for binary files.</p>
    );
  }

  if (contentState.error) {
    return <p className="text-destructive text-sm">{contentState.error}</p>;
  }

  return (
    <pre role="code" className="text-sm whitespace-pre-wrap font-mono">
      {contentState.content}
    </pre>
  );
}
