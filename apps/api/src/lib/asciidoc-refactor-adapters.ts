import {
  extractReferences,
  extractSymbols,
  resolveSandboxedPath,
  relativeProjectPath,
} from '@asciidocollab/shared';
import type { ReferenceExtractor, PathResolver } from '@asciidocollab/domain';

/**
 * Composition-root adapters that wire the pure AsciiDoc helpers from
 * `@asciidocollab/shared` into the domain's `ReferenceExtractor` / `PathResolver`
 * ports (US12). The domain layer stays free of any concrete parser or path
 * logic — it depends only on the interfaces — while the single shared
 * implementation (also used by the web symbol index) is injected here.
 */

/** Shared-backed extractor for `include::`/`image::`/`xref:` references and symbols. */
export const referenceExtractor: ReferenceExtractor = { extractReferences, extractSymbols };

/** Shared-backed sandbox path resolver (Constitution IX) plus its relative inverse. */
export const pathResolver: PathResolver = { resolveSandboxedPath, relativeProjectPath };
