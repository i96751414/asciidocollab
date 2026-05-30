"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { projectsApi, Project } from "@/lib/api";
import { ProjectSettingsForm } from "@/components/project-settings-form";

/**
 * Page for editing project settings.
 */
export default function ProjectSettingsPage() {
  const parameters = useParams();
  const projectId = String(parameters.id);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProject() {
      try {
        const response = await projectsApi.get(projectId);
        setProject(response.data);
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to load project");
      } finally {
        setLoading(false);
      }
    }

    fetchProject();
  }, [projectId]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-6" />
        <div className="h-96 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center py-12">
          <p className="text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Project not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Project Settings</h1>
        <p className="text-muted-foreground">
          Update {project.name} settings.
        </p>
      </div>
      <ProjectSettingsForm project={project} />
    </div>
  );
}
