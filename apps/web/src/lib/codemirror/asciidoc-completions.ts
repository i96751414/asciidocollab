// Barrel for AsciiDoc CodeMirror completion sources. Each completion concern lives
// in its own module under ./completions; this file preserves the original public
// import surface so existing importers and tests keep working unchanged.

export { createAttributeCompletionSource, attributeCompletionSource } from '@/lib/codemirror/completions/attribute';
export { sourceLanguageCompletionSource } from '@/lib/codemirror/completions/source-language';
export { createXrefCompletionSource, xrefCompletionSource } from '@/lib/codemirror/completions/xref';
export { createIncludeCompletionSource } from '@/lib/codemirror/completions/include';
export { TABLE_SKELETON, tableSnippetCompletionSource, tableCellCompletionSource } from '@/lib/codemirror/completions/table';
export { captionCompletionSource } from '@/lib/codemirror/completions/caption';
export { createImageCompletionSource } from '@/lib/codemirror/completions/image';
