import { getProjectAccess } from "@/lib/get-project-access";
import { MembersClient } from "./members-client";

interface MembersPageProperties {
  params: Promise<{ id: string }>;
}

/** Server component page for viewing and managing members of a specific project. */
export default async function ProjectMembersPage({ params }: MembersPageProperties) {
  const { id } = await params;
  const { project, members, currentUserId, currentUserRole } = await getProjectAccess(
    id,
    "owner",
  );

  return (
    <MembersClient
      projectId={id}
      projectName={project.name}
      members={members}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
      isArchived={!!project.archivedAt}
    />
  );
}
