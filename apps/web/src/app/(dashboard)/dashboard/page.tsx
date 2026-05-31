"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { projectsApi, Project } from "@/lib/api";
import { ProjectCard } from "@/components/project-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

/**
 *
 */
export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletedNotice, setDeletedNotice] = useState(false);
  const searchParameters = useSearchParams();

  useEffect(() => {
    if (searchParameters.get("deleted") === "1") {
      setDeletedNotice(true);
      const timer = setTimeout(() => setDeletedNotice(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParameters]);

  useEffect(() => {
    async function fetchProjects() {
      try {
        const response = await projectsApi.list({ page: 1, limit: 20 });
        setProjects(response.data);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Failed to load projects");
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
          <div key={index} className="h-48 rounded-lg border bg-muted animate-pulse" />
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

  return (
    <div className="space-y-6">
      {deletedNotice && (
        <div className="p-3 text-sm text-green-700 bg-green-50 rounded-md border border-green-200">
          Project deleted successfully.
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Your Projects</h2>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/archived">Archived projects</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard/projects/new">New Project</Link>
          </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create your first project to get started with collaborative documentation."
          actionLabel="Create Project"
          actionHref="/dashboard/projects/new"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
