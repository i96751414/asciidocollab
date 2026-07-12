/**
 * @file The warm-VM lifecycle facade layered over the typed {@link WasiBridge}. A single Ruby VM is
 * instantiated once per session (the cold start) and reused for every subsequent render — the
 * expensive wasm compile + gem/stdlib boot happens exactly once. The convert invocation and the web
 * worker program against this small facade rather than touching the bridge (or the raw interop
 * libraries) directly.
 *
 * The bridge is dependency-injected via a factory ({@link RubyPdfVmDeps.createBridge}) so unit tests
 * pass an in-memory fake bridge and production supplies `() => createWasiBridge({ module })` at the
 * composition root. No real interop library is bound here.
 */

import type { RubyValue, WasiBridge } from './wasi-bridge';

// ---------------------------------------------------------------------------
// Errors (no magic strings).
// ---------------------------------------------------------------------------

/** Structured error codes surfaced by the warm-VM facade. */
export const RUBY_PDF_VM_ERROR = {
  /** An operation that needs a running VM was called before {@link RubyPdfVm.warmup}. */
  NOT_WARMED: 'not-warmed',
} as const;

/** The union of structured error codes the warm-VM facade can raise. */
export type RubyPdfVmErrorCode = (typeof RUBY_PDF_VM_ERROR)[keyof typeof RUBY_PDF_VM_ERROR];

/** A typed error raised by the warm-VM facade. */
export class RubyPdfVmError extends Error {
  /**
   * Carry the structured code alongside the human-readable message.
   *
   * @param code - The structured error code identifying the failure.
   * @param message - The human-readable explanation forwarded to `Error`.
   */
  constructor(
    readonly code: RubyPdfVmErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RubyPdfVmError';
  }
}

// ---------------------------------------------------------------------------
// Facade surface.
// ---------------------------------------------------------------------------

/** The outcome of a {@link RubyPdfVm.warmup} call. */
export interface WarmupOutcome {
  /**
   * `true` only when this call actually instantiated a cold VM; `false` when it reused the existing
   * warm one. Callers use this to emit a cold-start (`vm-init`) progress signal exactly once.
   */
  readonly coldStart: boolean;
}

/** Low-level dependency: how to construct a fresh {@link WasiBridge} for a cold start. */
export interface RubyPdfVmDeps {
  /**
   * Build a not-yet-instantiated bridge. Invoked once per cold start (first warmup, and again after
   * {@link RubyPdfVm.dispose}). Production passes `() => createWasiBridge({ module })`; tests inject
   * an in-memory fake.
   */
  createBridge: () => WasiBridge;
}

/**
 * The warm-VM facade the convert path and the worker program against: a single reused Ruby VM with
 * an accessor to run Ruby ({@link RubyPdfVm.eval}/{@link RubyPdfVm.evalAsync}) and pass-through VFS
 * access, all delegating to the underlying {@link WasiBridge}.
 */
export interface RubyPdfVm {
  /** Whether a warm VM is currently instantiated and ready to serve evals / VFS access. */
  readonly ready: boolean;
  /**
   * Instantiate the VM on the first call and reuse it thereafter. Idempotent: repeated calls (and
   * concurrent ones) resolve to the same warm VM; only the genuine cold start reports
   * `coldStart: true`.
   *
   * @returns The warmup outcome, flagging whether this call performed the cold start.
   */
  warmup(): Promise<WarmupOutcome>;
  /**
   * Evaluate Ruby synchronously against the warm VM.
   *
   * @param code - The Ruby source run against the VM.
   * @returns The value the evaluated Ruby produced.
   */
  eval(code: string): RubyValue;
  /**
   * Evaluate Ruby that may `await` JS promises against the warm VM.
   *
   * @param code - The Ruby source run against the VM.
   * @returns The value the evaluated Ruby resolves to.
   */
  evalAsync(code: string): Promise<RubyValue>;
  /**
   * Write bytes into the in-memory VFS.
   *
   * @param path - The VFS path the bytes are written to.
   * @param data - The raw content stored at that path.
   */
  writeFile(path: string, data: Uint8Array): void;
  /**
   * Read bytes back from the in-memory VFS.
   *
   * @param path - The VFS path to read.
   * @returns The bytes stored at that path.
   */
  readFile(path: string): Uint8Array;
  /**
   * Remove a file from the in-memory VFS (no-op when absent).
   *
   * @param path - The VFS path whose file is deleted.
   */
  removeFile(path: string): void;
  /**
   * List the immediate entry names of a VFS directory.
   *
   * @param path - The VFS directory whose entries are enumerated.
   * @returns The immediate entry names within that directory.
   */
  readdir(path: string): string[];
  /**
   * Whether a VFS path exists.
   *
   * @param path - The VFS path to probe for occupancy.
   * @returns `true` when the path exists in the VFS.
   */
  exists(path: string): boolean;
  /** Tear the VM down; the facade becomes not-ready and the next warmup performs a fresh cold start. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Implementation.
// ---------------------------------------------------------------------------

class RubyPdfVmImpl implements RubyPdfVm {
  private bridge: WasiBridge | null = null;
  private warmupInFlight: Promise<void> | null = null;

  constructor(private readonly deps: RubyPdfVmDeps) {}

  get ready(): boolean {
    return this.bridge !== null && this.bridge.ready;
  }

  async warmup(): Promise<WarmupOutcome> {
    if (this.ready) {
      return { coldStart: false };
    }
    if (this.warmupInFlight !== null) {
      await this.warmupInFlight;
      return { coldStart: false };
    }

    const bridge = this.deps.createBridge();
    this.bridge = bridge;
    const inFlight = bridge.instantiate();
    this.warmupInFlight = inFlight;
    try {
      await inFlight;
    } catch (error) {
      // A failed cold start leaves no usable VM; drop the bridge so a retry starts clean.
      this.bridge = null;
      throw error;
    } finally {
      this.warmupInFlight = null;
    }
    return { coldStart: true };
  }

  eval(code: string): RubyValue {
    return this.requireBridge().eval(code);
  }

  async evalAsync(code: string): Promise<RubyValue> {
    return this.requireBridge().evalAsync(code);
  }

  writeFile(path: string, data: Uint8Array): void {
    this.requireBridge().writeFile(path, data);
  }

  readFile(path: string): Uint8Array {
    return this.requireBridge().readFile(path);
  }

  removeFile(path: string): void {
    this.requireBridge().removeFile(path);
  }

  readdir(path: string): string[] {
    return this.requireBridge().readdir(path);
  }

  exists(path: string): boolean {
    return this.requireBridge().exists(path);
  }

  dispose(): void {
    if (this.bridge !== null) {
      this.bridge.dispose();
      this.bridge = null;
    }
    this.warmupInFlight = null;
  }

  private requireBridge(): WasiBridge {
    if (this.bridge === null || !this.bridge.ready) {
      throw new RubyPdfVmError(
        RUBY_PDF_VM_ERROR.NOT_WARMED,
        'Ruby PDF VM has not been warmed up; call warmup() first',
      );
    }
    return this.bridge;
  }
}

/**
 * Create a warm-VM facade over a dependency-injected {@link WasiBridge} factory. The VM is
 * instantiated lazily on the first {@link RubyPdfVm.warmup} and reused for the session.
 */
export function createRubyPdfVm(deps: RubyPdfVmDeps): RubyPdfVm {
  return new RubyPdfVmImpl(deps);
}
