/**
 * Loads and warms the REAL Asciidoctor-PDF wasm engine through the package's shipping bridge/VM
 * seams, headlessly in Node — the same code path the browser worker composes, minus the DOM. One warm
 * VM is compiled + booted once and reused across every fixture convert in a run, mirroring the warm-VM
 * reuse the production controller relies on.
 */

import { readFileSync } from 'node:fs';
import {
  createWasiBridge,
  createRubyPdfVm,
  populateProject,
  invokeConvert,
  type ProjectSnapshot,
  type RenderRequest,
} from '@asciidocollab/asciidoc-pdf';

/** A warmed engine that converts project snapshots to normalized PDF bytes. */
export interface ParityEngine {
  /**
   * Populate the snapshot into the warm VM and convert it, returning the deterministic PDF bytes.
   *
   * @param snapshot - The project snapshot to populate and convert.
   * @returns The normalized PDF bytes produced by the engine.
   */
  convert(snapshot: ProjectSnapshot): Promise<Uint8Array>;
  /** Tear the VM down. */
  dispose(): void;
}

/**
 * Compile the wasm module once, boot one warm VM, and return an engine that converts snapshots. The
 * caller owns disposal. A convert failure surfaces as a thrown error carrying the engine's phase/code.
 */
export async function createParityEngine(wasmPath: string): Promise<ParityEngine> {
  const wasmBytes = readFileSync(wasmPath);
  const wasmModule = await WebAssembly.compile(wasmBytes);
  const vm = createRubyPdfVm({ createBridge: () => createWasiBridge({ module: wasmModule }) });
  await vm.warmup();

  let requestCounter = 0;

  return {
    async convert(snapshot: ProjectSnapshot): Promise<Uint8Array> {
      populateProject(vm, snapshot);
      requestCounter += 1;
      const request: RenderRequest = {
        requestId: `parity-${requestCounter}`,
        mode: 'export',
        snapshot,
        optimize: false,
      };
      const result = await invokeConvert({ vm, request });
      if (!result.ok) {
        throw new Error(`Engine convert failed: ${result.error.phase}/${result.error.code}: ${result.error.message}`);
      }
      return result.bytes;
    },
    dispose(): void {
      vm.dispose();
    },
  };
}
