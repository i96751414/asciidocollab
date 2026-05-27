/**
 * Immutable value object representing creation and last-update timestamps.
 * Encapsulates the createdAt / updatedAt pair and validates their ordering.
 *
 * @invariant `createdAt` must be less than or equal to `updatedAt`.
 */
export class Timestamps {
  constructor(
    /** The date and time when the entity was created. Defaults to now. */
    public readonly createdAt: Date = new Date(),
    /** The date and time when the entity was last updated. Defaults to now. */
    public readonly updatedAt: Date = new Date(),
  ) {
    if (createdAt > updatedAt) {
      throw new Error('createdAt must be <= updatedAt');
    }
  }
}
