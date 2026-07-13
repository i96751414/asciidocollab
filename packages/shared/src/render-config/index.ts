/** @file Barrel for the project-level render-configuration model, validation, and resolver. */

export {
  renderConfigSchema,
  normalizeRenderConfig,
  safeNormalizeRenderConfig,
  PINNED_ATTRIBUTE_KEYS,
  PDF_PAGE_SIZES,
  EMPTY_RENDER_CONFIG,
  type RenderConfig,
} from './config';
export {
  resolveRenderAttributes,
  stripSoftDefault,
  SOFT_DEFAULT_SUFFIX,
  RENDER_OPTION_CATALOG,
  type ResolvedRenderConfig,
} from './resolve';
