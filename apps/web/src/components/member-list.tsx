"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { membersApi, ProjectMember, ProjectMemberRole } from "@/lib/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";

const ALL_ROLES: ProjectMemberRole[] = ["viewer", "editor", "owner"];

interface MemberListProperties {
  projectId: string;
  members: ProjectMember[];
  currentUserId: string;
  currentUserRole: ProjectMemberRole;
  isArchived?: boolean;
  onUpdateRole?: (userId: string, role: ProjectMemberRole) => void;
  onRemove?: (userId: string) => void;
}

/** Renders the list of project members with role management and removal controls for owners. */
export function MemberList({
  projectId,
  members,
  currentUserId,
  currentUserRole,
  isArchived = false,
  onUpdateRole,
  onRemove,
}: MemberListProperties) {
  const [loading, setLoading] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  const canManageRoles = currentUserRole === "owner";
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const isSoleOwner = canManageRoles && ownerCount <= 1;

  const handleRoleChange = async (userId: string, newRole: ProjectMemberRole) => {
    setLoading(userId);
    setRoleError(null);
    try {
      await membersApi.updateRole(projectId, userId, newRole);
      onUpdateRole?.(userId, newRole);
    } catch (caughtError) {
      setRoleError(caughtError instanceof Error ? caughtError.message : "Failed to update role");
    } finally {
      setLoading(null);
    }
  };

  const handleConfirmRemove = async () => {
    if (!removeTarget) return;
    setLoading(removeTarget);
    try {
      await membersApi.remove(projectId, removeTarget);
      onRemove?.(removeTarget);
    } catch (caughtError) {
      setRoleError(caughtError instanceof Error ? caughtError.message : "Failed to remove member");
    } finally {
      setLoading(null);
      setRemoveTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      {roleError && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">{roleError}</div>
      )}

      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No members yet.</p>
      ) : (
        <div className="space-y-2">
          {members.map((member) => {
            const isSelf = member.userId === currentUserId;
            const isLastOwnerSelf = isSelf && isSoleOwner;
            const isLastOwner = member.role === "owner" && ownerCount <= 1;
            const canRemove = !isArchived && !isLastOwner;

            return (
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
                    <p className="font-medium">
                      {member.displayName}
                      {isSelf && (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {canManageRoles ? (
                    <select
                      value={member.role}
                      onChange={(event) => {
                        const selected = ALL_ROLES.find((r) => r === event.target.value);
                        if (selected) handleRoleChange(member.userId, selected);
                      }}
                      disabled={isArchived || loading === member.userId || isLastOwnerSelf}
                      title={
                        isLastOwnerSelf
                          ? "Assign the owner role to another member before changing your own role"
                          : undefined
                      }
                      className="text-sm rounded-md border border-input bg-background px-2 py-1 disabled:opacity-50"
                    >
                      {ALL_ROLES.map((role) => (
                        <option key={role} value={role} disabled={isLastOwnerSelf && role !== "owner"}>
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-sm capitalize text-muted-foreground">{member.role}</span>
                  )}

                  {canManageRoles && canRemove && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemoveTarget(member.userId)}
                      disabled={loading === member.userId}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmationDialog
        open={!!removeTarget}
        onOpenChange={(isOpen) => { if (!isOpen) setRemoveTarget(null); }}
        title="Remove member"
        description="Are you sure you want to remove this member? They will lose access to the project."
        confirmLabel="Remove"
        onConfirm={handleConfirmRemove}
        loading={!!loading}
      />
    </div>
  );
}
