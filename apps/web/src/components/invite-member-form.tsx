"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { membersApi, ProjectMember } from "@/lib/api";
import { inviteMemberSchema, type InviteMemberInput } from "@asciidocollab/shared";

interface InviteMemberFormProperties {
  projectId: string;
  onSuccess?: (member: ProjectMember) => void;
}

/**
 * Form component for inviting a member to a project.
 */
export function InviteMemberForm({ projectId, onSuccess }: InviteMemberFormProperties) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<InviteMemberInput>({
    email: "",
    role: "viewer",
  });

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const validatedData = inviteMemberSchema.parse(formData);
      const response = await membersApi.invite(projectId, {
        email: validatedData.email,
        role: validatedData.role,
      });

      onSuccess?.(response.data);
      setFormData({ email: "", role: "viewer" });
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("Failed to invite member");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, email: event.target.value });
  };

  const handleRoleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value === "viewer" || value === "editor" || value === "administrator") {
      setFormData({ ...formData, role: value });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email Address *</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={handleEmailChange}
            placeholder="user@example.com"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="role">Role *</Label>
          <select
            id="role"
            value={formData.role}
            onChange={handleRoleChange}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="administrator">Administrator</option>
          </select>
        </div>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "Inviting..." : "Invite Member"}
      </Button>
    </form>
  );
}
