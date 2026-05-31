import { getProjectAccess } from "@/lib/get-project-access";
import { SettingsClient } from "./settings-client";

interface SettingsPageProperties {
  params: Promise<{ id: string }>;
}

/**
 *
 */
export default async function ProjectSettingsPage({ params }: SettingsPageProperties) {
  const { id } = await params;
  const { project, currentUserRole } = await getProjectAccess(id, "owner");

  return <SettingsClient project={project} currentUserRole={currentUserRole} />;
}
