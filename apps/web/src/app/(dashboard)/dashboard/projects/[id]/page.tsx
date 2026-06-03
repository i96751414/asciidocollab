import Link from "next/link";
import { getProjectAccess } from "@/lib/get-project-access";
import { Button } from "@/components/ui/button";

interface ProjectPageProperties {
  params: Promise<{ id: string }>;
}

/** Project overview page. The editor is not yet implemented — shows project metadata and management links. */
export default async function ProjectPage({ params }: ProjectPageProperties) {
  const { id } = await params;
  const { project, currentUserRole } = await getProjectAccess(id, "viewer");
  const canManage = currentUserRole === "owner";

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to projects
      </Link>

      <div>
        <h2 className="text-2xl font-bold">{project.name}</h2>
        {project.description && (
          <p className="mt-1 text-muted-foreground">{project.description}</p>
        )}
      </div>

      {canManage && (
        <div className="flex gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/projects/${id}/members`}>Members</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/projects/${id}/settings`}>Settings</Link>
          </Button>
        </div>
      )}

      <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-12 text-center">
        <p className="text-muted-foreground">The project editor is not yet available.</p>
      </div>
    </div>
  );
}
