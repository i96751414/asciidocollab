import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { UsersClient } from "./users-client";

/** Admin users page — redirects non-admins and renders the users management client. */
export default async function AdminUsersPage() {
  const profile = await getProfile();
  if (!profile?.isAdmin) {
    redirect("/dashboard");
  }

  return <UsersClient />;
}
