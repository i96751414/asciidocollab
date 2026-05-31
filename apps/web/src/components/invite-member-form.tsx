"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UserSearchCombobox } from "@/components/user-search-combobox";
import { membersApi, ProjectMember, ProjectMemberRole, UserSearchResult } from "@/lib/api";

const INVITE_ROLES: ProjectMemberRole[] = ["viewer", "editor", "owner"];

interface InviteMemberFormProperties {
  projectId: string;
  onSuccess?: (member: ProjectMember) => void;
}

/**
 *
 */
export function InviteMemberForm({ projectId, onSuccess }: InviteMemberFormProperties) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [role, setRole] = useState<ProjectMemberRole>("viewer");

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedUser) return;
    setLoading(true);
    setError(null);

    try {
      const response = await membersApi.invite(projectId, {
        email: selectedUser.email,
        role,
      });
      onSuccess?.(response.data);
      setSelectedUser(null);
      setRole("viewer");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to invite member");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>
      )}

      <div className="space-y-2">
        <Label htmlFor="user-search">Search User *</Label>
        <UserSearchCombobox
          projectId={projectId}
          value={selectedUser}
          onChange={setSelectedUser}
          placeholder="Search by name or email…"
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="invite-role">Role *</Label>
        <select
          id="invite-role"
          value={role}
          onChange={(event) => {
            const selected = INVITE_ROLES.find((r) => r === event.target.value);
            if (selected) setRole(selected);
          }}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {INVITE_ROLES.map((r) => (
            <option key={r} value={r}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" disabled={loading || !selectedUser}>
        {loading ? "Adding…" : "Add Member"}
      </Button>
    </form>
  );
}
