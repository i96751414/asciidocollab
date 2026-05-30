import Link from "next/link";
import { cn } from "@/lib/utilities";
import { Button } from "@/components/ui/button";

const navigation = [
  { name: "Projects", href: "/dashboard" },
  { name: "Archived", href: "/dashboard/archived" },
];

/**
 * Dashboard layout with sidebar navigation.
 *
 * @param properties - The component properties.
 * @param properties.children - The child components to render.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        {/* Sidebar */}
        <div className="hidden w-64 border-r bg-muted/40 lg:block">
          <div className="flex h-16 items-center border-b px-6">
            <Link href="/dashboard" className="text-xl font-semibold">
              AsciiDocCollab
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
            <Button asChild>
              <Link href="/dashboard/projects/new">Create Project</Link>
            </Button>
          </div>
          <main className="p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
