'use client';

interface Properties {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourcePath: string;
  destinationPath: string;
  hasConflict: boolean;
  onConfirm: () => void;
  onConfirmAndRename: () => void;
}

/** Dialog asking the user to confirm a drag-and-drop move, with optional conflict/rename path. */
export function MoveConfirmationDialog({
  open,
  onOpenChange,
  sourcePath,
  destinationPath,
  hasConflict,
  onConfirm,
  onConfirmAndRename,
}: Properties) {
  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="rounded-lg bg-background p-6 shadow-lg w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold">Move File</h2>

        <div className="text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">From: </span>
            <span className="font-mono">{sourcePath}</span>
          </p>
          <p>
            <span className="text-muted-foreground">To: </span>
            <span className="font-mono">{destinationPath}</span>
          </p>
        </div>

        {hasConflict && (
          <p className="text-sm text-destructive">
            A file with the same name already exists in the destination folder.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded border hover:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>

          {hasConflict ? (
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={onConfirmAndRename}
            >
              Move &amp; Rename
            </button>
          ) : (
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={onConfirm}
            >
              Confirm
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
