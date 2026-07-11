/** @file The typed, non-leaky error vocabulary for review operations (wire codes). */

/**
 * The closed set of review error categories that cross the API boundary. Each
 * maps to a fixed HTTP status and carries no internal detail (Security
 * Constitution). The domain expresses these as `DomainError` subclasses; this
 * union is the on-the-wire code the client can branch on.
 */
export type ReviewErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'validation_failed'
  | 'anchor_invalid'
  | 'conflict';

/** A typed review error as returned in the API error envelope. */
export interface ReviewErrorDto {
  /** The stable, non-leaky error category. */
  code: ReviewErrorCode;
  /** A human-readable message safe to show to the client. */
  message: string;
}
