'use client';
import { useState, useEffect, useRef } from 'react';
import type { Asciidoctor as AsciidoctorType } from 'asciidoctor';

const ASCIIDOC_EXTENSIONS = new Set(['.adoc', '.asciidoc', '.asc']);

/** Returns true if the file name has an AsciiDoc extension (.adoc, .asciidoc, .asc). */
export function isAsciiDocFile(nodeName: string): boolean {
  const dotIndex = nodeName.lastIndexOf('.');
  if (dotIndex <= 0) return false;
  const extension = nodeName.slice(dotIndex).toLowerCase();
  return ASCIIDOC_EXTENSIONS.has(extension);
}

interface AsciiDocPreviewProperties {
  content: string;
  isOpen: boolean;
  onToggle: () => void;
}

/** Collapsible panel that renders AsciiDoc source to HTML using Asciidoctor.js. */
export function AsciiDocPreview({ content, isOpen, onToggle }: AsciiDocPreviewProperties) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cancelledReference = useRef(false);

  useEffect(() => {
    if (!isOpen || !content) {
      setHtml(null);
      return;
    }

    cancelledReference.current = false;
    setLoading(true);

    import('asciidoctor').then((module_) => {
      if (cancelledReference.current) return;
      const processor: AsciidoctorType = (module_.default ?? module_)();
      const result = String(processor.convert(content, { safe: 'safe' }));
      if (!cancelledReference.current) {
        setHtml(result);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelledReference.current) setLoading(false);
    });

    return () => { cancelledReference.current = true; };
  }, [isOpen, content]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-2 border-b shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</span>
        <button
          onClick={onToggle}
          className="text-xs text-muted-foreground hover:text-foreground"
          aria-label={isOpen ? 'collapse preview' : 'expand preview'}
        >
          {isOpen ? '›' : '‹'}
        </button>
      </div>

      {isOpen && (
        <div className="flex-1 overflow-auto p-4">
          {loading && <p className="text-muted-foreground text-sm">Rendering…</p>}
          {!loading && html !== null && (
            <div
              data-testid="asciidoc-output"
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      )}
    </div>
  );
}
