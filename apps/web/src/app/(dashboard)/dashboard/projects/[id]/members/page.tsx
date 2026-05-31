import { getProjectAccess } from "@/lib/get-project-access";
import { MembersClient } from "./members-client";

interface MembersPageProperties {
  params: Promise<{ id: string }>;
}

/**
 *
 */
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
