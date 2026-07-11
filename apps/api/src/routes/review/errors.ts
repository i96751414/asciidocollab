import type { FastifyReply } from 'fastify';
import {
  DomainError,
  PermissionDeniedError,
  ValidationError,
  ReviewItemNotFoundError,
  AnchorInvalidError,
  ReviewOperationInvalidError,
  ReviewCountConflictError,
} from '@asciidocollab/domain';

/** A typed review error mapped to its HTTP status and non-leaky wire code. */
interface MappedReviewError {
  /** The HTTP status code. */
  status: number;
  /** The stable, non-leaky error code echoed to the client. */
  code: string;
}

/**
 * Maps a review {@link DomainError} to its HTTP status + code. Typed and
 * non-leaky (Security Constitution): 403 forbidden, 404 not found, 400
 * validation/anchor, 409 conflict; anything else is an opaque 500.
 *
 * @param error - The domain error returned by a review use case.
 * @returns The HTTP status and wire code to send.
 */
export function mapReviewError(error: DomainError): MappedReviewError {
  if (error instanceof PermissionDeniedError) return { status: 403, code: 'FORBIDDEN' };
  if (error instanceof ReviewItemNotFoundError) return { status: 404, code: 'NOT_FOUND' };
  if (error instanceof AnchorInvalidError) return { status: 400, code: 'ANCHOR_INVALID' };
  if (error instanceof ValidationError) return { status: 400, code: 'VALIDATION_ERROR' };
  if (error instanceof ReviewCountConflictError) return { status: 409, code: 'COUNT_CONFLICT' };
  if (error instanceof ReviewOperationInvalidError) return { status: 409, code: 'CONFLICT' };
  return { status: 500, code: 'INTERNAL_ERROR' };
}

/**
 * Sends a review domain error on the reply using the standard `{ error: { code,
 * message } }` envelope. A 500 hides the internal message.
 *
 * @param reply - The Fastify reply.
 * @param error - The domain error to send.
 */
export function sendReviewError(reply: FastifyReply, error: DomainError): FastifyReply {
  const { status, code } = mapReviewError(error);
  const message = status === 500 ? 'Internal server error' : error.message;
  return reply.status(status).send({ error: { code, message } });
}
