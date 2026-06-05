import type { EditorView } from '@codemirror/view';
import { outlineField } from '@/lib/codemirror/asciidoc-outline';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';

/**
 * Returns the current section outline by reading outlineField from the CM6 view state.
 *  Because the editor re-renders on every cursor move (via cursorPos state), this is
 *  always fresh without any polling or subscription overhead.
 */
export function useSectionOutline(view: EditorView | null): SectionOutlineEntry[] {
  if (!view) return [];
  try { return view.state.field(outlineField); } catch { return []; }
}
