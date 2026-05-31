import Link from "next/link";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utilities";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { SignOutButton } from "./sign-out-button";

const navigation = [
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
  const session = await getSession();
  if (!session) {
    redirect("/login?reason=expired");
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        {/* Sidebar */}
        <div className="hidden w-64 border-r bg-muted/40 lg:block">
          <div className="flex h-16 items-center border-b px-6">
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
        <div className="flex-1">
          <div className="flex h-16 items-center justify-between border-b px-6">
            <h1 className="text-lg font-semibold">Dashboard</h1>
            <div className="flex items-center gap-2">
              <Button asChild>
                <Link href="/dashboard/projects/new">Create Project</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/account">Account</Link>
              </Button>
              <SignOutButton />
            </div>
          </div>
          <main className="p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
