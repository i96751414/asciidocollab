"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Project } from "@/lib/api";

interface ProjectCardProperties {
  project: Project;
}

/** Renders a summary card for a project showing its name, description, role badge, tags, and last-updated date. */
export function ProjectCard({ project }: ProjectCardProperties) {
  const canManage = project.role === "owner";

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg">
            <Link href={`/dashboard/projects/${project.id}`} className="hover:underline">
              {project.name}
            </Link>
          </CardTitle>
          <div className="flex items-center gap-2">
            {project.role && (
              <Badge variant="secondary" className="capitalize">
                {project.role}
              </Badge>
            )}
            {canManage && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/dashboard/projects/${project.id}/settings`}>Settings</Link>
              </Button>
            )}
          </div>
        </div>
        <CardDescription className="line-clamp-2">
          {project.description || "No description"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{project.tags.length > 0 ? project.tags.join(", ") : "No tags"}</span>
          <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}
