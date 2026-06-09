"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminApi, type AdminUser, ApiError } from "@/lib/api";

interface RemoveTarget {
  user: AdminUser;
  preview: Array<{ id: string; name: string }>;
}

/** Admin page component for managing users, invitations, and open-registration settings. */
export function UsersClient() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMessage, setInviteMessage] = useState<{ /** Whether the invite action succeeded or failed. */
  type: "success" | "error"; /** Human-readable feedback message. */
  text: string } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [openRegistration, setOpenRegistration] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    adminApi.getAdminUsers().then((d) => setUsers(d.users)).catch(() => {});
    adminApi.getAdminSettings().then((s) => setOpenRegistration(s.openRegistration)).catch(() => {});
  }, []);

  function handleInvite(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteMessage(null);
    startTransition(async () => {
      try {
        await adminApi.inviteUser(inviteEmail);
        setInviteMessage({ type: "success", text: `Invitation sent to ${inviteEmail}` });
        setInviteEmail("");
      } catch (error) {
        const code = error instanceof ApiError ? error.code : "UNKNOWN";
        let text = "Failed to send invitation.";
        if (code === "DUPLICATE_EMAIL") text = "Email already registered.";
        else if (code === "INVITATION_ALREADY_PENDING") text = "Pending invitation exists.";
        else if (error instanceof ApiError) text = error.message;
        setInviteMessage({ type: "error", text });
      }
    });
  }

  function toggleAdmin(user: AdminUser) {
    startTransition(async () => {
      try {
        await adminApi.setAdminStatus(user.id, !user.isAdmin);
        setUsers((previous) => previous.map((u) => u.id === user.id ? { ...u, isAdmin: !u.isAdmin } : u));
      } catch (error) {
        alert(error instanceof ApiError ? error.message : "Failed to update admin status");
      }
    });
  }

  async function openRemoveDialog(user: AdminUser) {
    const preview = await adminApi.getUserRemovalPreview(user.id).catch(() => ({ projectsToTransfer: [] }));
    setRemoveTarget({ user, preview: preview.projectsToTransfer });
  }

  function confirmRemove() {
    if (!removeTarget) return;
    startTransition(async () => {
      try {
        await adminApi.removeUser(removeTarget.user.id);
        setUsers((previous) => previous.filter((u) => u.id !== removeTarget.user.id));
        setRemoveTarget(null);
      } catch (error) {
        alert(error instanceof ApiError ? error.message : "Failed to remove user");
      }
    });
  }

  function toggleOpenRegistration() {
    startTransition(async () => {
      const updated = await adminApi.updateAdminSettings({ openRegistration: !openRegistration }).catch(() => null);
      if (updated) setOpenRegistration(updated.openRegistration);
    });
  }

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold">User Management</h2>

      <div className="rounded-lg border p-4 flex items-center justify-between">
        <div>
          <p className="font-medium">Open Registration</p>
          <p className="text-sm text-muted-foreground">Allow anyone to self-register</p>
        </div>
        <Button variant={openRegistration ? "default" : "outline"} onClick={toggleOpenRegistration} disabled={isPending}>
          {openRegistration ? "Enabled — click to disable" : "Disabled — click to enable"}
        </Button>
      </div>

      <div className="rounded-lg border p-6 space-y-4">
        <h3 className="text-lg font-medium">Invite User</h3>
        <form onSubmit={handleInvite} className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="inviteEmail">Email address</Label>
            <Input id="inviteEmail" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="user@example.com" required />
          </div>
          <Button type="submit" disabled={isPending || !inviteEmail}>
            {isPending ? "Sending…" : "Send Invitation"}
          </Button>
        </form>
        {inviteMessage && (
          <p role="alert" className={`text-sm ${inviteMessage.type === "success" ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
            {inviteMessage.text}
          </p>
        )}
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left">User</th>
              <th className="px-4 py-3 text-left">Badges</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{user.displayName}</div>
                  <div className="text-muted-foreground">{user.email}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {user.isAdmin && <span className="rounded bg-blue-100 px-1 text-xs text-blue-800">Admin</span>}
                    {user.emailVerified ? (
                      <span className="rounded px-1 text-xs bg-[hsl(var(--success-bg))] text-[hsl(var(--success))]">Verified</span>
                    ) : (
                      <span className="rounded px-1 text-xs bg-[hsl(var(--warning-bg))] text-[hsl(var(--warning))]">Unverified</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => toggleAdmin(user)} disabled={isPending}>
                      {user.isAdmin ? "Remove Admin" : "Make Admin"}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => openRemoveDialog(user)} disabled={isPending}>
                      Remove
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {removeTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 max-w-md w-full space-y-4 shadow-lg">
            <h3 className="text-lg font-semibold">Remove {removeTarget.user.displayName}?</h3>
            <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
            {removeTarget.preview.length > 0 && (
              <div className="text-sm text-destructive space-y-1">
                <p>These projects will be transferred to you:</p>
                <ul className="list-disc pl-4">
                  {removeTarget.preview.map((p) => <li key={p.id}>{p.name}</li>)}
                </ul>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRemoveTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmRemove} disabled={isPending}>Confirm</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
