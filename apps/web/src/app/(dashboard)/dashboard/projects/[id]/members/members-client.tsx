"use client";

import { useState } from "react";
import { ProjectMember, ProjectMemberRole } from "@/lib/api";
import { MemberList } from "@/components/member-list";
import { InviteMemberForm } from "@/components/invite-member-form";
import { SoleOwnerWarning } from "@/components/sole-owner-warning";

interface MembersClientProperties {
  projectId: string;
  projectName: string;
  members: ProjectMember[];
  currentUserId: string;
  currentUserRole: ProjectMemberRole;
  isArchived: boolean;
}

/**
 *
 */
export function MembersClient({
  projectId,
  projectName,
  members: initialMembers,
  currentUserId,
  currentUserRole,
  isArchived,
}: MembersClientProperties) {
  const [members, setMembers] = useState<ProjectMember[]>(initialMembers);

  const ownerCount = members.filter((m) => m.role === "owner").length;
  const isSoleOwner = currentUserRole === "owner" && ownerCount <= 1;

  const handleUpdateRole = (userId: string, role: string) => {
    const validRoles = ["viewer", "editor", "owner"] as const;
    const parsed = validRoles.find((r) => r === role) ?? "viewer";
    setMembers(members.map((m) => m.userId === userId ? { ...m, role: parsed } : m));
  };

  const handleRemove = (userId: string) => {
    setMembers(members.filter((m) => m.userId !== userId));
  };

  const handleInvite = (newMember: ProjectMember) => {
    setMembers([...members, newMember]);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {isArchived && (
        <div className="p-4 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-sm font-medium">
          This project is archived. Member management is read-only.
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold">Manage Members</h1>
        <p className="text-muted-foreground">Invite and manage members for {projectName}.</p>
      </div>

      <SoleOwnerWarning visible={isSoleOwner} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">Current Members</h2>
          <MemberList
            projectId={projectId}
            members={members}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            isArchived={isArchived}
            onUpdateRole={handleUpdateRole}
            onRemove={handleRemove}
          />
        </div>

        {!isArchived && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Invite Member</h2>
            <div className="p-4 border rounded-lg">
              <InviteMemberForm
                projectId={projectId}
                onSuccess={handleInvite}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
