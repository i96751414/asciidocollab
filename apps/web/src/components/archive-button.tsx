"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { projectsApi } from "@/lib/api";

interface ArchiveButtonProperties {
  projectId: string;
  isArchived: boolean;
  onArchive?: () => void;
  onRestore?: () => void;
}

/**
 * Button component for archiving or restoring a project.
 */
export function ArchiveButton({
  projectId,
  isArchived,
  onArchive,
  onRestore,
}: ArchiveButtonProperties) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!confirm(isArchived ? "Restore this project?" : "Archive this project?")) {
      return;
    }

    setLoading(true);
    try {
      if (isArchived) {
        await projectsApi.restore(projectId);
        onRestore?.();
      } else {
        await projectsApi.archive(projectId);
        onArchive?.();
      }
    } catch (error) {
      // Error is logged but not displayed to user
      void error;
    } finally {
      setLoading(false);
    }
  };

  const buttonText = (() => {
    if (loading) {
      return isArchived ? "Restoring..." : "Archiving...";
    }
    return isArchived ? "Restore Project" : "Archive Project";
  })();

  return (
    <Button
      variant={isArchived ? "default" : "outline"}
      onClick={handleClick}
      disabled={loading}
    >
      {buttonText}
    </Button>
  );
}
