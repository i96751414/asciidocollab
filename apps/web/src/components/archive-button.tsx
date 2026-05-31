"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { projectsApi } from "@/lib/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";

interface ArchiveButtonProperties {
  projectId: string;
  projectName: string;
  isArchived: boolean;
  onArchive?: () => void;
  onRestore?: () => void;
}

/**
 *
 */
export function ArchiveButton({
  projectId,
  projectName,
  isArchived,
  onArchive,
  onRestore,
}: ArchiveButtonProperties) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isArchived) {
        await projectsApi.restore(projectId);
        onRestore?.();
      } else {
        await projectsApi.archive(projectId);
        onArchive?.();
      }
      setOpen(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Operation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {error && (
        <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>
      )}
      <Button variant={isArchived ? "default" : "outline"} onClick={() => setOpen(true)}>
        {isArchived ? "Restore Project" : "Archive Project"}
      </Button>
      <ConfirmationDialog
        open={open}
        onOpenChange={setOpen}
        title={isArchived ? "Restore Project" : "Archive Project"}
        description={
          isArchived
            ? `Restore "${projectName}"? It will become active again.`
            : `Archive "${projectName}"? It will be hidden from the active project list.`
        }
        confirmLabel={isArchived ? "Restore" : "Archive"}
        variant={isArchived ? "default" : "destructive"}
        onConfirm={handleConfirm}
        loading={loading}
      />
    </>
  );
}
