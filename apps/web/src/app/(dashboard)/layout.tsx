import Link from "next/link";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utilities";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/auth";
import { CurrentUserProvider } from "@/contexts/current-user-context";
import { SignOutButton } from "./sign-out-button";

const baseNavigation = [
  { name: "Projects", href: "/dashboard" },
  { name: "Archived", href: "/dashboard/archived" },
];

/** Properties for the dashboard layout. */
interface DashboardLayoutProperties {
  /** Page content rendered in the main area. */
  children: React.ReactNode;
}

/**
 * Dashboard layout with sidebar navigation and session validation.
 */
export default async function DashboardLayout({ children }: DashboardLayoutProperties) {
  const profile = await getProfile();
  if (!profile) {
    redirect("/login?reason=expired");
  }

  const navigation = [
    ...baseNavigation,
    ...(profile.isAdmin ? [{ name: "Users", href: "/dashboard/admin/users" }] : []),
  ];

  return (
    <CurrentUserProvider user={profile}>
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Sidebar */}
        <div className="hidden w-64 shrink-0 border-r bg-muted/40 lg:flex lg:flex-col overflow-y-auto">
          <div className="flex h-16 shrink-0 items-center border-b px-6">
            <Link href="/dashboard" className="text-xl font-semibold">
              AsciiDoCollab
            </Link>
          </div>
          <nav className="space-y-1 p-4">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                  "text-muted-foreground"
                )}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex h-16 shrink-0 items-center justify-between border-b px-6">
            <h1 className="text-lg font-semibold">Dashboard</h1>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{profile.displayName}</span>
              <Button asChild>
                <Link href="/dashboard/projects/new">Create Project</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/account">Account</Link>
              </Button>
              <SignOutButton />
            </div>
          </div>
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </div>
    </CurrentUserProvider>
  );
}
