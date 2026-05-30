"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { membersApi, ProjectMember } from "@/lib/api";

interface MemberListProperties {
  projectId: string;
  members: ProjectMember[];
  onUpdateRole?: (userId: string, role: string) => void;
  onRemove?: (userId: string) => void;
}

/**
 * Component displaying the list of project members.
 */
export function MemberList({ projectId, members, onUpdateRole, onRemove }: MemberListProperties) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleRoleChange = async (userId: string, newRole: "viewer" | "editor" | "administrator") => {
    setLoading(userId);
    try {
      await membersApi.updateRole(projectId, userId, newRole);
      onUpdateRole?.(userId, newRole);
    } catch {
      // Error is handled by the parent component
    } finally {
      setLoading(null);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!confirm("Are you sure you want to remove this member?")) {
      return;
    }

    setLoading(userId);
    try {
      await membersApi.remove(projectId, userId);
      onRemove?.(userId);
    } catch {
      // Error is handled by the parent component
    } finally {
      setLoading(null);
    }
  };

  const handleRoleSelectChange = (userId: string, event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value === "viewer" || value === "editor" || value === "administrator") {
      handleRoleChange(userId, value);
    }
  };

  return (
    <div className="space-y-4">
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No members yet. Invite someone to collaborate.
        </p>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.userId}
              className="flex items-center justify-between p-3 rounded-lg border"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-sm font-medium">
                    {member.displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-medium">{member.displayName}</p>
                  <p className="text-sm text-muted-foreground">{member.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={member.role}
                  onChange={(event) => handleRoleSelectChange(member.userId, event)}
                  disabled={loading === member.userId}
                  className="text-sm rounded-md border border-input bg-background px-2 py-1"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="administrator">Administrator</option>
                </select>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(member.userId)}
                  disabled={loading === member.userId}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
