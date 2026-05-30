"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api";

/**
 * Nav bar button that calls logout and redirects to /login.
 */
export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    try {
      await authApi.logout();
    } catch {
      // Best-effort logout — redirect regardless
    }

    router.push("/login");
  }

  return (
    <Button variant="outline" onClick={handleSignOut}>
      Sign Out
    </Button>
  );
}
