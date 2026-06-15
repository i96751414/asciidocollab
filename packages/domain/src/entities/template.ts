import { TemplateId } from '../value-objects/ids/template-id';
import { TemplateCategory } from '../value-objects/project/template-category';
import { ProjectId } from '../value-objects/ids/project-id';

/**
 * Represents a project template used for bootstrapping new projects.
 *
 * A Template may be linked to a source project (`sourceProjectId`) from which
 * it was derived, or it may be a built-in template with no associated project.
 */
export class Template {
  /** Creates a new Template. */
  constructor(
    /** Unique identifier for this template. */
    public readonly id: TemplateId,
    /** Display name of the template. */
    public readonly name: string,
    /** Optional description of the template's purpose and content. */
    public readonly description: string | null,
    /**
     * Category that groups this template (e.g. 'documentation',
     *  'tutorial').
     */
    public readonly category: TemplateCategory,
    /**
     * The project from which this template was derived, or null for built-in
     * templates.
     */
    public readonly sourceProjectId: ProjectId | null,
    /** Timestamp of template creation. Defaults to the current time. */
    public readonly createdAt: Date = new Date(),
  ) {}
}
