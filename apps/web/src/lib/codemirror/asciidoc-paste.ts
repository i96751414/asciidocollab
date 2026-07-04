import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import DOMPurify from 'dompurify';
import TurndownService from 'turndown';
import { markdownSubsetToAsciidoc } from './html-to-asciidoc';
import { isImageFile } from './asciidoc-image-extensions';

/**
 * Paste / drop conveniences. All externally-sourced content
 * crosses the Constitution IX boundary here:
 *  - paste a URL over a selection → `link:`/bare-URL macro,
 *  - paste HTML → DOMPurify-sanitize → turndown (HTML→MD) → AsciiDoc mapper,
 *  - paste/drop an image → upload via the asset API → insert `image::`,
 *    with type validation and graceful fallback.
 *
 * The conversion helpers are pure (DOM-dependent ones run under jsdom) so they
 * unit-test directly; the CM event wiring is exercised by the e2e spec.
 */

const URL_RE = /^(https?|ftp|mailto):\S+$/i;
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

/** True when the whole pasted string is a single URL (so it can wrap a selection). */
export function looksLikeUrl(text: string): boolean {
  return URL_RE.test(text.trim());
}

/** Build an AsciiDoc link macro for a URL wrapping the (possibly empty) label. */
export function urlToLinkMarkup(url: string, label: string): string {
  const trimmed = url.trim();
  const text = label.trim();
  if (/^(https?|ftp|mailto):/i.test(trimmed)) {
    return text ? `${trimmed}[${text}]` : trimmed;
  }
  return `link:${trimmed}[${text}]`;
}

/** Sanitize pasted HTML then convert it (via Markdown) to an AsciiDoc subset. */
export function htmlToAsciidoc(html: string): string {
  const safe = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  const markdown = turndown.turndown(safe);
  return markdownSubsetToAsciidoc(markdown);
}

/** Build an `image::path[]` macro for an uploaded asset. */
export function imageMacro(path: string): string {
  return `image::${path}[]`;
}

/** Options for the paste/drop handler — image upload is delegated to the host. */
export interface PasteHandlerOptions {
  /**
   * Uploads a pasted/dropped image.
   *
   * @param file - The image file to upload.
   * @returns The inserted project-relative path, or null on failure.
   */
  uploadImage?: (file: File) => Promise<string | null>;
}

function replaceSelection(view: EditorView, insert: string): boolean {
  const { from, to } = view.state.selection.main;
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } });
  return true;
}

function firstImageFile(items: DataTransfer | null): File | null {
  if (!items) return null;
  for (const file of items.files) {
    if (file.type.startsWith('image/') || isImageFile(file.name)) return file;
  }
  return null;
}

/** CM6 paste/drop handler implementing the URL/HTML/image conveniences. */
export function asciidocPasteHandlers(options: PasteHandlerOptions = {}): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const data = event.clipboardData;
      if (!data) return false;

      const imageFile = firstImageFile(data);
      if (imageFile && options.uploadImage) {
        event.preventDefault();
        void options.uploadImage(imageFile).then((path) => {
          if (path) replaceSelection(view, imageMacro(path));
        });
        return true;
      }

      const text = data.getData('text/plain');
      if (text && looksLikeUrl(text) && !view.state.selection.main.empty) {
        const { from, to } = view.state.selection.main;
        event.preventDefault();
        return replaceSelection(view, urlToLinkMarkup(text, view.state.sliceDoc(from, to)));
      }

      const html = data.getData('text/html');
      if (html && html.trim() !== '') {
        event.preventDefault();
        return replaceSelection(view, htmlToAsciidoc(html));
      }
      return false;
    },

    drop(event, view) {
      const imageFile = firstImageFile(event.dataTransfer);
      if (imageFile && options.uploadImage) {
        event.preventDefault();
        void options.uploadImage(imageFile).then((path) => {
          if (path) replaceSelection(view, imageMacro(path));
        });
        return true;
      }
      return false;
    },
  });
}
