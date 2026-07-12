/**
 * @file Content-addressed cache for rendered diagram/math/bibliography artifacts.
 *
 * The pipeline re-renders on every editor keystroke, but the great majority of
 * edits touch prose, not a diagram or math block. Keying each generated asset by
 * a pure hash of *what it was rendered from* means an unchanged block resolves to
 * the same key and is served from cache instead of being regenerated. That both
 * saves work and keeps placement stable, since an identical source always maps to
 * identical bytes.
 *
 * ## Hash choice
 *
 * The key is a 64-bit FNV-1a digest over the UTF-8 bytes of a canonical encoding
 * of the inputs, rendered as a fixed-width lowercase hex string. FNV-1a is chosen
 * because it is:
 *
 * - **Dependency-free and compact** — a few lines of integer/bignum math, so it
 *   runs anywhere the worker does. Node's `crypto` is not reliably present in a
 *   browser Web Worker, and a full pure-TS SHA-256 is far heavier than cache
 *   keying warrants.
 * - **Deterministic** — it consults no clock, locale, network, or filesystem;
 *   equal inputs always produce an equal digest across runs and environments.
 * - **Well-distributed** — 64 bits give a birthday-collision expectation on the
 *   order of billions of distinct blocks, comfortably beyond the few hundred
 *   generated assets a document holds. This is a *cache* key, not a security or
 *   integrity primitive; a rare collision would at worst reuse a wrong asset, and
 *   the population is nowhere near the collision regime.
 *
 * Inputs are canonicalized with an explicit length prefix on every field so that
 * moving characters across a field boundary (for example, source `"ab"` + version
 * `"c"` versus source `"a"` + version `"bc"`) cannot alias to the same digest, and render
 * parameters are sorted by key so map-iteration order never perturbs the result.
 *
 * ## LRU without a wall clock
 *
 * Recency is tracked by a monotonically increasing *logical tick* — a plain
 * counter bumped on each store and each hit — not by `Date.now()`. Keeping wall
 * time out of the output path preserves determinism (two renders of the same
 * inputs behave identically regardless of when they run) and makes eviction
 * order a pure function of access order, so tests prove it by controlling
 * sequence alone, with no timers.
 */

import type { CacheEntry, GeneratedAsset } from '../protocol';

/** FNV-1a 64-bit offset basis. */
const FNV_OFFSET_BASIS_64 = 0xCB_F2_9C_E4_84_22_23_25n;

/** FNV-1a 64-bit prime. */
const FNV_PRIME_64 = 0x1_00_00_00_01_B3n;

/** Mask that truncates the running hash back to 64 bits after each multiply. */
const U64_MASK = 0xFF_FF_FF_FF_FF_FF_FF_FFn;

/** Radix used to render the digest as hexadecimal. */
const HEX_RADIX = 16;

/** Fixed width of the hex digest (64 bits ÷ 4 bits per hex character). */
export const HASH_HEX_LENGTH = 16;

/**
 * Separator between a field's length prefix and its value inside the canonical
 * encoding. A control character keeps it clear of ordinary source content; the
 * length prefix (not this delimiter) is what actually guarantees unambiguous
 * field boundaries.
 */
const LENGTH_VALUE_SEPARATOR = '';

/** Reusable UTF-8 encoder; available in both Node and the Web Worker global scope. */
const UTF8_ENCODER = new TextEncoder();

/** Default number of generated assets retained before logical-tick LRU eviction begins. */
export const DEFAULT_CACHE_CAPACITY = 128;

/**
 * The inputs that fully determine a generated asset: the block's source text, the
 * render parameters applied to it, and the version of the shim that produced it.
 * Any change to one of these must change the resulting {@link GeneratedAsset}, so
 * all three participate in the cache key.
 */
export interface SourceHashParts {
  /** The verbatim source of the diagram/math/bibliography block. */
  readonly source: string;
  /** Render parameters (engine, scale, format, …); key order is irrelevant. */
  readonly renderParams: Readonly<Record<string, string>>;
  /** Version identifier of the producing shim family. */
  readonly shimVersion: string;
}

/** Length-prefix a field so concatenated fields have unambiguous boundaries. */
const encodeField = (value: string): string =>
  `${value.length}${LENGTH_VALUE_SEPARATOR}${value}`;

/** Produce a stable, injection-resistant string encoding of the hash inputs. */
const canonicalize = (parts: SourceHashParts): string => {
  const sortedParameterKeys = Object.keys(parts.renderParams).toSorted();
  let canonical = encodeField(parts.shimVersion) + encodeField(parts.source);
  for (const key of sortedParameterKeys) {
    canonical += encodeField(key) + encodeField(parts.renderParams[key]);
  }
  return canonical;
};

/** FNV-1a 64-bit digest of a string's UTF-8 bytes, as fixed-width lowercase hex. */
const fnv1a64Hex = (input: string): string => {
  let hash = FNV_OFFSET_BASIS_64;
  for (const byte of UTF8_ENCODER.encode(input)) {
    hash = ((hash ^ BigInt(byte)) * FNV_PRIME_64) & U64_MASK;
  }
  return hash.toString(HEX_RADIX).padStart(HASH_HEX_LENGTH, '0');
};

/**
 * Compute the content-address key for a generated asset from its source, render
 * parameters, and shim version. Pure and deterministic: equal inputs always
 * yield the same key, regardless of render parameter ordering or when it runs.
 */
export const computeSourceHash = (parts: SourceHashParts): string =>
  fnv1a64Hex(canonicalize(parts));

/**
 * An in-memory, content-addressed store of {@link GeneratedAsset}s with bounded
 * capacity and logical-tick LRU eviction. Keys are {@link computeSourceHash}
 * digests. Eviction and recency are driven entirely by a logical counter, never
 * by the wall clock, so behaviour stays deterministic on the render output path.
 */
export class GeneratedAssetCache {
  private readonly entries = new Map<string, CacheEntry>();

  private readonly capacity: number;

  private tick = 0;

  /**
   * @param capacity - Maximum number of entries retained before LRU eviction.
   *   Must be a positive integer.
   */
  public constructor(capacity: number = DEFAULT_CACHE_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('GeneratedAssetCache capacity must be a positive integer');
    }
    this.capacity = capacity;
  }

  /** Number of assets currently held. */
  public get size(): number {
    return this.entries.size;
  }

  /** Whether a key is present. A pure membership probe: it does not affect recency. */
  public has(key: string): boolean {
    return this.entries.has(key);
  }

  /**
   * Return the cached asset for a key and mark it most-recently-used, or
   * `undefined` on a miss.
   */
  public get(key: string): GeneratedAsset | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    this.entries.set(key, { key: entry.key, asset: entry.asset, lastUsedTick: this.nextTick() });
    return entry.asset;
  }

  /** Store (or replace) an asset under a key, then evict if over capacity. */
  public set(key: string, asset: GeneratedAsset): void {
    this.entries.set(key, { key, asset, lastUsedTick: this.nextTick() });
    this.evictIfOverCapacity();
  }

  /**
   * Return the cached asset for a key, or produce it via `produce`, cache it, and
   * return it. A hit never invokes `produce`, so an unchanged block source (same
   * key) short-circuits re-rendering.
   */
  public getOrCompute(key: string, produce: () => GeneratedAsset): GeneratedAsset {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const produced = produce();
    this.set(key, produced);
    return produced;
  }

  /** Advance and return the logical recency counter. */
  private nextTick(): number {
    this.tick += 1;
    return this.tick;
  }

  /** Drop the entry with the smallest logical tick until within capacity. */
  private evictIfOverCapacity(): void {
    while (this.entries.size > this.capacity) {
      let lruKey: string | undefined;
      let lruTick = Number.POSITIVE_INFINITY;
      for (const entry of this.entries.values()) {
        if (entry.lastUsedTick < lruTick) {
          lruTick = entry.lastUsedTick;
          lruKey = entry.key;
        }
      }
      if (lruKey === undefined) {
        return;
      }
      this.entries.delete(lruKey);
    }
  }
}
