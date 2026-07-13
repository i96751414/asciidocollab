/**
 * @file Turns a validated {@link RenderConfig} into the artifacts the render layer consumes: the
 * Asciidoctor attribute map (values marked as overridable soft-defaults) that BOTH the HTML preview and
 * the PDF export engines accept, plus the list of extra font directories to APPEND to the PDF font
 * search path. Pure and environment-agnostic — the web layer sandbox-resolves the font dirs and merges
 * the attribute map into each engine's attribute seam.
 */

import { PINNED_ATTRIBUTE_KEYS, type RenderConfig } from './config';

/**
 * Asciidoctor convention: a value ending in `@` is an overridable soft-default — a same-named
 * in-document attribute still wins. Every attribute this resolver emits carries the marker so a
 * document header always overrides a project default. Mirrors the render workers' `SOFT_DEFAULT_SUFFIX`.
 */
export const SOFT_DEFAULT_SUFFIX = '@';

/** Append the overridable soft-default marker to a raw attribute value, yielding just the marker for a blank value. */
function soft(value: string): string {
  return `${value}${SOFT_DEFAULT_SUFFIX}`;
}

/**
 * Strip a single trailing soft-default marker, recovering the raw value. Used by consumers that must
 * read the raw value (such as path discovery in the snapshot builder) rather than hand it to the engine.
 */
export function stripSoftDefault(value: string): string {
  return value.endsWith(SOFT_DEFAULT_SUFFIX) ? value.slice(0, -SOFT_DEFAULT_SUFFIX.length) : value;
}

/** How a config field's value becomes an attribute value. */
type OptionKind = 'flag' | 'int' | 'value';

/** Maps one config field to its Asciidoctor attribute name and value shape. */
interface OptionDescriptor {
  readonly configKey: keyof RenderConfig;
  readonly attribute: string;
  readonly kind: OptionKind;
}

/**
 * The curated option catalog: each entry maps a {@link RenderConfig} field to the Asciidoctor attribute
 * it sets. `customAttributes` and `extraFontDirs` are handled separately (they are not 1:1 attributes).
 * No attribute here is in {@link PINNED_ATTRIBUTE_KEYS}.
 */
export const RENDER_OPTION_CATALOG: readonly OptionDescriptor[] = Object.freeze([
  // Core document behaviour.
  { configKey: 'doctype', attribute: 'doctype', kind: 'value' },
  { configKey: 'toc', attribute: 'toc', kind: 'flag' },
  { configKey: 'toclevels', attribute: 'toclevels', kind: 'int' },
  { configKey: 'sectnums', attribute: 'sectnums', kind: 'flag' },
  { configKey: 'sectnumlevels', attribute: 'sectnumlevels', kind: 'int' },
  { configKey: 'icons', attribute: 'icons', kind: 'value' },
  { configKey: 'experimental', attribute: 'experimental', kind: 'flag' },
  { configKey: 'hardbreaks', attribute: 'hardbreaks', kind: 'flag' },
  // Paths / resolution.
  { configKey: 'imagesdir', attribute: 'imagesdir', kind: 'value' },
  { configKey: 'bibtexFile', attribute: 'bibtex-file', kind: 'value' },
  { configKey: 'bibtexStyle', attribute: 'bibtex-style', kind: 'value' },
  { configKey: 'bibtexOrder', attribute: 'bibtex-order', kind: 'value' },
  // Asciidoctor-PDF layout.
  { configKey: 'pdfTheme', attribute: 'pdf-theme', kind: 'value' },
  { configKey: 'media', attribute: 'media', kind: 'value' },
  { configKey: 'pdfPageSize', attribute: 'pdf-page-size', kind: 'value' },
  { configKey: 'pdfPageLayout', attribute: 'pdf-page-layout', kind: 'value' },
  { configKey: 'hyphens', attribute: 'hyphens', kind: 'flag' },
  { configKey: 'autofit', attribute: 'autofit-option', kind: 'flag' },
  { configKey: 'pdfFolioPlacement', attribute: 'pdf-folio-placement', kind: 'value' },
]);

/** The resolved artifacts a {@link RenderConfig} produces for the render layer. */
export interface ResolvedRenderConfig {
  /**
   * Asciidoctor attribute map (name → soft-defaulted value) for both engines. The `icons` field maps
   * `image` to the empty value (Asciidoctor's image-admonition default) and `font` to `font`.
   */
  readonly attributes: Record<string, string>;
  /**
   * Project-relative directories to APPEND to the PDF font search path (never replacing the derived
   * dirs or the baked default). The web layer sandbox-resolves each before it reaches the engine.
   */
  readonly extraFontDirs: readonly string[];
}

/** Compute the raw (pre-soft) attribute value for a catalog entry, or `undefined` to emit nothing. */
function rawValueFor(descriptor: OptionDescriptor, config: RenderConfig): string | undefined {
  const value = config[descriptor.configKey];
  if (value === undefined) {
    return undefined;
  }
  if (descriptor.kind === 'flag') {
    // A false flag leaves the engine default in place; only an explicit `true` sets the attribute.
    return value === true ? '' : undefined;
  }
  if (descriptor.kind === 'int') {
    return String(value);
  }
  // kind === 'value': `icons: image` selects Asciidoctor's default image admonitions (empty value).
  if (descriptor.configKey === 'icons' && value === 'image') {
    return '';
  }
  return String(value);
}

/**
 * Resolve a project render config into the attribute map (soft-defaulted) and the extra font dirs.
 *
 * Custom attributes are lower-cased, trimmed, and dropped when blank or in {@link PINNED_ATTRIBUTE_KEYS}
 * or when they collide with a curated attribute already emitted (the curated option wins). Every emitted
 * attribute — curated and custom — carries the soft-default `@` so a document header always overrides it.
 */
export function resolveRenderAttributes(config: RenderConfig): ResolvedRenderConfig {
  const attributes: Record<string, string> = {};
  // Tracks the attribute names already emitted so a custom attribute cannot override a curated one.
  // A dedicated Set (rather than an `in`/`hasOwnProperty` check against `attributes`) keeps the
  // collision test off the object's prototype chain, so exotic names (`toString`, `constructor`, …)
  // are treated as ordinary attributes instead of being silently dropped.
  const emitted = new Set<string>();

  for (const descriptor of RENDER_OPTION_CATALOG) {
    const raw = rawValueFor(descriptor, config);
    if (raw !== undefined) {
      attributes[descriptor.attribute] = soft(raw);
      emitted.add(descriptor.attribute);
    }
  }

  for (const [rawName, rawValue] of Object.entries(config.customAttributes ?? {})) {
    const name = rawName.trim().toLowerCase();
    if (name.length === 0 || PINNED_ATTRIBUTE_KEYS.has(name) || emitted.has(name)) {
      continue;
    }
    attributes[name] = soft(rawValue);
    emitted.add(name);
  }

  return { attributes, extraFontDirs: [...(config.extraFontDirs ?? [])] };
}
