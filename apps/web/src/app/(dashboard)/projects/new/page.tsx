import { ProjectForm } from "@/components/project-form";

/**
 * Page for creating a new project.
 */
export default function NewProjectPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Create New Project</h1>
        <p className="text-muted-foreground">
          Start a new collaborative documentation project.
        </p>
      </div>
      <ProjectForm />
    </div>
  );
}
