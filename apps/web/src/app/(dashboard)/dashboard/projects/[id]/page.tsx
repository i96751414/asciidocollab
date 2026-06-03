import { getProjectAccess } from "@/lib/get-project-access";
import { ProjectEditorLayout } from "./project-editor-layout";

interface ProjectPageProperties {
  params: Promise<{ id: string }>;
}

/** Server component that delegates to the client-side project editor layout. */
export default async function ProjectPage({ params }: ProjectPageProperties) {
  const { id } = await params;
  const { project, currentUserRole } = await getProjectAccess(id, "viewer");
  const canManage = currentUserRole === "owner";

  return (
    <ProjectEditorLayout
      projectId={id}
      projectName={project.name}
      projectDescription={project.description ?? null}
      isOwner={canManage}
    />
  );
}
