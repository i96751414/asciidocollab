"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { membersApi, projectsApi, Project, ProjectMember } from "@/lib/api";
import { InviteMemberForm } from "@/components/invite-member-form";
import { MemberList } from "@/components/member-list";

/**
 * Page for managing project members.
 */
export default function ProjectMembersPage() {
  const parameters = useParams();
  const projectId = String(parameters.id);
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [projectResponse, membersResponse] = await Promise.all([
          projectsApi.get(projectId),
          membersApi.list(projectId),
        ]);
        setProject(projectResponse.data);
        setMembers(membersResponse.data.members);
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [projectId]);

  const handleInviteSuccess = (newMember: ProjectMember) => {
    setMembers([...members, newMember]);
  };

  const handleUpdateRole = (userId: string, role: string) => {
    const validRoles = ["viewer", "editor", "administrator"] as const;
    const parsedRole = validRoles.find((r) => r === role) ?? "viewer";
    setMembers(
      members.map((m) =>
        m.userId === userId ? { ...m, role: parsedRole } : m
      )
    );
  };

  const handleRemove = (userId: string) => {
    setMembers(members.filter((m) => m.userId !== userId));
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-6" />
        <div className="h-96 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12">
          <p className="text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Project not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Manage Members</h1>
        <p className="text-muted-foreground">
          Invite and manage members for {project.name}.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">Current Members</h2>
          <MemberList
            projectId={projectId}
            members={members}
            onUpdateRole={handleUpdateRole}
            onRemove={handleRemove}
          />
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4">Invite Member</h2>
          <div className="p-4 border rounded-lg">
            <InviteMemberForm
              projectId={projectId}
              onSuccess={handleInviteSuccess}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
