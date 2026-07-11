/** @file Named constants for the review module — re-exported from the domain single authority. */

// The domain owns the canonical value; shared depends on domain, so it re-exports
// rather than duplicating, keeping exactly one authority for body length.
export { REVIEW_BODY_MAX_LEN } from '@asciidocollab/domain';
