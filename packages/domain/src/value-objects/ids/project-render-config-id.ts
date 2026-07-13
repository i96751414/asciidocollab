import { Uuid, validateUuid } from './uuid';

/** Strongly-typed UUID that identifies a ProjectRenderConfig record. */
export class ProjectRenderConfigId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  /**
   * Creates a validated ProjectRenderConfigId from a UUID string.
   *
   * @param value - A valid UUID v4 string.
   * @returns A new ProjectRenderConfigId instance.
   */
  static create(value: string): ProjectRenderConfigId {
    validateUuid(value, 'ProjectRenderConfigId');
    return new ProjectRenderConfigId(value);
  }
}
