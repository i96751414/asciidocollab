"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { projectsApi } from "@/lib/api";

interface DeleteProjectButtonProperties {
  projectId: string;
  projectName: string;
  onDeleted: () => void;
}

/** Renders a button that opens a confirmation dialog requiring the user to type the project name before permanently deleting it. */
export function DeleteProjectButton({
  projectId,
  projectName,
  onDeleted,
}: DeleteProjectButtonProperties) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = typed === projectName;

  const handleDelete = async () => {
    if (!confirmed) return;
    setLoading(true);
    setError(null);
    try {
      await projectsApi.delete(projectId);
      onDeleted();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to delete project");
      setLoading(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) { setTyped(""); setError(null); }
    setOpen(isOpen);
  };

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Delete Project
      </Button>
      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-lg bg-background p-6 shadow-lg"
            onPointerDownOutside={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => event.preventDefault()}
          >
            <Dialog.Title className="text-lg font-semibold text-destructive">
              Delete Project
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              This action is <strong>permanent and cannot be undone</strong>. All project data,
              members, and files will be deleted.
            </Dialog.Description>

            <div className="mt-4 space-y-2">
              <Label htmlFor="confirm-name">
                Type <strong>{projectName}</strong> to confirm:
              </Label>
              <Input
                id="confirm-name"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={projectName}
                autoComplete="off"
              />
            </div>

            {error && (
              <div className="mt-3 p-2 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => { setOpen(false); setTyped(""); }}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={!confirmed || loading}
              >
                {loading ? "Deleting…" : "Delete Project"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
