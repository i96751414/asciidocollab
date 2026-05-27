/**
 * Immutable value object representing creation and last-update timestamps.
 * Encapsulates the createdAt / updatedAt pair and validates their ordering.
 * Returns defensive copies of Date values to prevent external mutation.
 *
 * @invariant `createdAt` must be less than or equal to `updatedAt`.
 */
import { ValidationError } from '../errors/validation-error';

export class Timestamps {
  private readonly _createdAt: Date;
  private readonly _updatedAt: Date;

  constructor(
    /** The date and time when the entity was created. Defaults to now. */
    createdAt: Date = new Date(),
    /** The date and time when the entity was last updated. Defaults to now. */
    updatedAt: Date = new Date(),
  ) {
    if (createdAt > updatedAt) {
      throw new ValidationError('createdAt must be <= updatedAt');
    }
    this._createdAt = new Date(createdAt.getTime());
    this._updatedAt = new Date(updatedAt.getTime());
  }

  get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  get updatedAt(): Date {
    return new Date(this._updatedAt.getTime());
  }
}
