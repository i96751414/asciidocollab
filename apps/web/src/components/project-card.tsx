"use client";

import Link from "next/link";
import { Folder, FileText, Users, Clock, MoreVertical, Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Project } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format-relative-time";

interface ProjectCardProperties {
  project: Project;
}

/** Renders a summary card for a project: its folder icon, name, role badge, an options menu for owners, description, and a compact footer with file and member counts and the last-updated time. */
export function ProjectCard({ project }: ProjectCardProperties) {
  const canManage = project.role === "owner";

  return (
    <Card className="group relative flex flex-col h-full hover:shadow-md transition-shadow">
      {/* Stretched link makes the whole card navigate; interactive controls sit above it via z-10. */}
      <Link
        href={`/dashboard/projects/${project.id}`}
        aria-label={project.name}
        className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2 min-w-0">
            <Folder className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate group-hover:underline">
              {project.name}
            </span>
          </CardTitle>
          <div className="relative z-10 flex items-center gap-1 shrink-0">
            {project.role && (
              <Badge variant="secondary" className="capitalize">
                {project.role}
              </Badge>
            )}
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Project options"
                    onClick={(event) => event.stopPropagation()}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <MoreVertical className="h-4 w-4" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/dashboard/projects/${project.id}/members`}>
                      <Users className="mr-2 h-4 w-4" aria-hidden="true" />
                      Members
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/dashboard/projects/${project.id}/settings`}>
                      <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <CardDescription className="line-clamp-2">
          {project.description || "No description"}
        </CardDescription>
        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {project.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="font-normal text-muted-foreground">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="mt-auto pb-3">
        <div className="flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            {project.fileCount !== undefined && (
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" aria-hidden="true" />
                {project.fileCount} {project.fileCount === 1 ? "file" : "files"}
              </span>
            )}
            {project.memberCount !== undefined && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" aria-hidden="true" />
                {project.memberCount}
              </span>
            )}
          </div>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {formatRelativeTime(project.updatedAt)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
