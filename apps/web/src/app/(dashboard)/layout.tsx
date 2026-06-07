import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { CurrentUserProvider } from "@/contexts/current-user-context";
import { UserMenu } from "@/components/user-menu";

interface DashboardLayoutProperties {
  children: React.ReactNode;
}

/** Root layout for all authenticated dashboard routes — loads session profile and redirects if unauthenticated. */
export default async function DashboardLayout({ children }: DashboardLayoutProperties) {
  const profile = await getProfile();
  if (!profile) {
    redirect("/login?reason=expired");
  }

  return (
    <CurrentUserProvider user={profile}>
      <div className="h-screen flex flex-col overflow-hidden bg-background">
        <div className="flex h-16 shrink-0 items-center justify-between border-b px-6">
          <a href="/dashboard" className="text-xl font-semibold">AsciiDoCollab</a>
          <UserMenu profile={profile} />
        </div>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </CurrentUserProvider>
  );
}
