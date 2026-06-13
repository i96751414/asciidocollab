/**
 * Port for the pure AsciiDoc reference/symbol extraction the cross-file
 * refactoring use cases depend on (US12: find-usages, move/rename rewrite).
 *
 * The domain layer MUST stay free of any concrete parser, and the same
 * extraction already lives in `@asciidocollab/shared` (consumed by the web
 * symbol index). The domain therefore depends only on this interface; the
 * composition root wires the shared implementation in — keeping a single
 * extraction definition without the inner layer importing an outer one.
 */

/** A half-open text range within a file (document offsets). */
export interface TextRange {
  /** Start offset (inclusive). */
  from: number;
  /** End offset (exclusive). */
  to: number;
}

/** A reference from one file to a symbol/file/path elsewhere. */
export interface Reference {
  /** What kind of reference this is. */
  kind: 'xref' | 'include' | 'image' | 'attributeRef';
  /** The referenced symbol id, file path, or attribute name. */
  target: string;
  /** The file containing the reference. */
  fileId: string;
  /** The reference's location within its file. */
  range: TextRange;
}

/** A definable, referenceable symbol within the project. */
export interface ProjectSymbol {
  /** The kind of symbol. */
  kind: 'section' | 'anchor' | 'attribute';
  /** Section/anchor id or attribute name. */
  name: string;
  /** The file that defines the symbol. */
  fileId: string;
  /** The symbol definition's location. */
  range: TextRange;
}

/** Pure extraction of references and definable symbols from AsciiDoc content. */
export interface ReferenceExtractor {
  /**
   * Extract all references (xref/include/image/attributeRef) from a file's content.
   *
   * @param fileId - Identifier stamped onto each returned reference.
   * @param content - The file's AsciiDoc source.
   * @returns Every reference found, with its location.
   */
  extractReferences(fileId: string, content: string): Reference[];
  /**
   * Extract all definable symbols (sections/anchors/attributes) from a file's content.
   *
   * @param fileId - Identifier stamped onto each returned symbol.
   * @param content - The file's AsciiDoc source.
   * @returns Every definable symbol found, with its location.
   */
  extractSymbols(fileId: string, content: string): ProjectSymbol[];
}
