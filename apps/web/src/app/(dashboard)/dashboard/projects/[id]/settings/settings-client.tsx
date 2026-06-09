"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { projectsApi, Project, ProjectMemberRole } from "@/lib/api";
import { updateProjectSchema, type UpdateProjectInput } from "@asciidocollab/shared";
import { ArchiveButton } from "@/components/archive-button";
import { DeleteProjectButton } from "@/components/delete-project-button";

interface SettingsClientProperties {
  project: Project;
  currentUserRole: ProjectMemberRole;
}

/** Client component for editing project settings. */
export function SettingsClient({ project, currentUserRole }: SettingsClientProperties) {
  const router = useRouter();
  const isArchived = !!project.archivedAt;
  const isOwner = currentUserRole === "owner";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState<UpdateProjectInput>({
    name: project.name,
    description: project.description || "",
    tags: project.tags,
  });

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const validatedData = updateProjectSchema.parse(formData);
      await projectsApi.update(project.id, {
        name: validatedData.name,
        description: validatedData.description || undefined,
        tags: validatedData.tags,
      });
      setSuccess(true);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to update project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="icon" className="h-8 w-8 shrink-0">
          <Link href={`/dashboard/projects/${project.id}`} aria-label="Back to project">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Project Settings</h1>
          <p className="text-muted-foreground">Update {project.name} settings.</p>
        </div>
      </div>
      {isArchived && (
        <div className="p-4 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-sm font-medium">
          This project is archived. Settings are read-only. Restore the project to make changes.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>
        )}
        {success && (
          <div className="rounded-md border p-3 text-sm border-[hsl(var(--success-border))] bg-[hsl(var(--success-bg))] text-[hsl(var(--success))]">
            Project settings updated successfully.
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="name">Project Name *</Label>
          <Input
            id="name"
            value={formData.name || ""}
            onChange={(event) => setFormData({ ...formData, name: event.target.value })}
            placeholder="My Awesome Project"
            required
            maxLength={100}
            disabled={isArchived}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            value={formData.description || ""}
            onChange={(event) => setFormData({ ...formData, description: event.target.value })}
            placeholder="Optional project description"
            className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
            maxLength={1000}
            disabled={isArchived}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tags">Tags (comma-separated)</Label>
          <Input
            id="tags"
            value={formData.tags?.join(", ") || ""}
            onChange={(event) =>
              setFormData({
                ...formData,
                tags: event.target.value.split(",").map((t) => t.trim()).filter(Boolean),
              })
            }
            placeholder="documentation, api, guide"
            disabled={isArchived}
          />
        </div>

        {!isArchived && (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        )}
      </form>

      {isOwner && (
        <div className="space-y-4 pt-4 border-t">
          <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
          <div className="flex items-center gap-4">
            <ArchiveButton
              projectId={project.id}
              projectName={project.name}
              isArchived={isArchived}
              onArchive={() => router.push("/dashboard")}
              onRestore={() => router.refresh()}
            />
            <DeleteProjectButton
              projectId={project.id}
              projectName={project.name}
              onDeleted={() => router.push("/dashboard?deleted=1")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
