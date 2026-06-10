/**
 * The origin of an authenticated request, threaded from the delivery layer into
 * audit metadata (FR-017). Both fields are optional — background or
 * system-initiated actions legitimately lack a request origin.
 *
 * Defined in the domain (rather than `shared`) because domain use cases consume
 * it directly and the domain layer must not depend on outer layers.
 */
export interface RequestContext {
  /** Source network address of the request, when available. */
  readonly ipAddress?: string;
  /** Client identifier (user-agent) of the request, when available. */
  readonly userAgent?: string;
}
