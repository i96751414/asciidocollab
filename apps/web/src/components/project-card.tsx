"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Project } from "@/lib/api";

interface ProjectCardProperties {
  project: Project;
}

/**
 * Card component displaying project information.
 */
export function ProjectCard({ project }: ProjectCardProperties) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg">
            <Link href={`/dashboard/projects/${project.id}`} className="hover:underline">
              {project.name}
            </Link>
          </CardTitle>
          {project.role && (
            <Badge variant="secondary" className="capitalize">
              {project.role}
            </Badge>
          )}
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
