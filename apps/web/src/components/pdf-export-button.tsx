"use client";

import { FileDown, Loader2 } from "lucide-react";
import type { RenderPhase } from "@asciidocollab/asciidoc-pdf";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utilities";

/** Human-readable progress copy for each render phase, in pipeline order. */
const PHASE_LABELS: Record<RenderPhase, string> = {
  "vm-init": "Starting the PDF engine…",
  preprocessing: "Preparing the document…",
  citations: "Resolving citations…",
  "diagrams-math": "Rendering diagrams and math…",
  converting: "Generating the PDF…",
  optimizing: "Optimising the PDF…",
  done: "Finishing up…",
};

/** Shown while exporting before the first phase update lands (VM cold start). */
const COLD_START_LABEL = "Preparing your PDF…";

/** Idle call-to-action copy, also the stable accessible name for the trigger. */
const IDLE_LABEL = "Export to PDF";

/** Presentational contract for the export trigger; all behaviour is injected. */
export interface PdfExportButtonProperties {
  /** Fired when the user requests an export. */
  onExport: () => void;
  /** Whether a render is currently in flight. */
  isExporting: boolean;
  /** The most recent render phase, when known, driving the progress copy. */
  phase?: RenderPhase;
  /** Disables the trigger while idle (e.g. No root file selected). */
  disabled?: boolean;
  /** Extra design-token classes merged onto the button's root element. */
  className?: string;
}

/** A design-token-styled "Export to PDF" action with a cold-start/phase spinner. */
export function PdfExportButton({
  onExport,
  isExporting,
  phase,
  disabled = false,
  className,
}: PdfExportButtonProperties) {
  const progressLabel = phase ? PHASE_LABELS[phase] : COLD_START_LABEL;

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onExport}
      disabled={disabled || isExporting}
      aria-busy={isExporting}
      className={cn("gap-2", className)}
    >
      {isExporting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
          <span role="status" className="text-muted-foreground">
            {progressLabel}
          </span>
        </>
      ) : (
        <>
          <FileDown className="h-4 w-4" aria-hidden="true" />
          {IDLE_LABEL}
        </>
      )}
    </Button>
  );
}
