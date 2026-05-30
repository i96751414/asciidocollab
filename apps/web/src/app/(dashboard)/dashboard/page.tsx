"use client";

import { useEffect, useState } from "react";
import { projectsApi, Project } from "@/lib/api";
import { ProjectCard } from "@/components/project-card";
import { EmptyState } from "@/components/empty-state";

/**
 * Dashboard page displaying the user's projects.
 */
export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProjects() {
      try {
        const response = await projectsApi.list({ page: 1, limit: 20 });
        setProjects(response.data);
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to load projects");
      } finally {
        setLoading(false);
      }
    }

    fetchProjects();
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-48 rounded-lg border bg-muted animate-pulse"
            />
          ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        title="No projects yet"
        description="Create your first project to get started with collaborative documentation."
        actionLabel="Create Project"
        actionHref="/dashboard/projects/new"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Your Projects</h2>
        <p className="text-sm text-muted-foreground">
          {projects.length} project{projects.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}
