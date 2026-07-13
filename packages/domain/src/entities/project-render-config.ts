import { ProjectRenderConfigId } from '../value-objects/ids/project-render-config-id';
import { ProjectId } from '../value-objects/ids/project-id';
import { Timestamps } from '../value-objects/common/timestamps';
import { ValidationError } from '../errors/common/validation-error';

/**
 * The project-level render configuration document — an opaque map of AsciiDoc / Asciidoctor-PDF options
 * a project applies to every document it renders. Its OPTION SEMANTICS (which keys are valid, their
 * ranges/enums, the pinned-attribute blocklist) are validated at the API boundary by the shared
 * `renderConfigSchema` before the entity is constructed; the domain treats it as a structurally-checked
 * JSON object (a plain, non-array object), which is all the persistence layer needs.
 */
export type RenderConfigData = Readonly<Record<string, unknown>>;

/** A project's saved render configuration (one per project). */
export class ProjectRenderConfig {
  public readonly timestamps: Timestamps;

  /**
   * @param id - Unique identifier for this render-config record.
   * @param projectId - The project this configuration belongs to.
   * @param config - The boundary-validated render-config document (a plain object).
   * @param timestamps - Optional creation/update timestamps; defaults to now.
   */
  constructor(
    public readonly id: ProjectRenderConfigId,
    public readonly projectId: ProjectId,
    public readonly config: RenderConfigData,
    timestamps?: Timestamps,
  ) {
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
      throw new ValidationError('Render config must be a plain object.');
    }
    this.timestamps = timestamps ?? new Timestamps();
  }
}
