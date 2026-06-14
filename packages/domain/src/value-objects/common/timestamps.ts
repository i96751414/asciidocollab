import { ValidationError } from '../../errors/common/validation-error';

/**
 * Immutable value object representing creation and last-update timestamps.
 * Encapsulates the createdAt / updatedAt pair and validates their ordering.
 * Returns defensive copies of Date values to prevent external mutation.
 *
 * @invariant `createdAt` must be less than or equal to `updatedAt`.
 */
export class Timestamps {
  private readonly _createdAt: Date;
  private readonly _updatedAt: Date;

  /**
   * @param createdAt - The date and time when the entity was created. Defaults to now.
   * @param updatedAt - The date and time when the entity was last updated. Defaults to now.
   * @throws {ValidationError} If `createdAt` is later than `updatedAt`.
   */
  constructor(
    createdAt: Date = new Date(),
    updatedAt: Date = new Date(),
  ) {
    if (createdAt > updatedAt) {
      throw new ValidationError('createdAt must be <= updatedAt');
    }
    this._createdAt = new Date(createdAt);
    this._updatedAt = new Date(updatedAt);
  }

  /** @returns A defensive copy of the creation date. */
  get createdAt(): Date {
    return new Date(this._createdAt);
  }

  /** @returns A defensive copy of the last-update date. */
  get updatedAt(): Date {
    return new Date(this._updatedAt);
  }
}
