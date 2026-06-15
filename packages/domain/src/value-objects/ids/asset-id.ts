import { Uuid, validateUuid } from './uuid';

/**
 * Unique identifier for an Asset entity.
 */
export class AssetId extends Uuid {
  private constructor(value: string) {
    super(value);
  }

  /**
   * Creates a new AssetId after validating the UUID format.
   *
   * @param value - A UUID v4 string.
   * @returns A new AssetId instance.
   * @throws {ValidationError} If the value is not a valid UUID v4.
   */
  static create(value: string): AssetId {
    validateUuid(value, 'AssetId');
    return new AssetId(value);
  }
}
