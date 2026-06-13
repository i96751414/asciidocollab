import { ProjectSymbol, Reference, ReferenceExtractor } from '../../../src/ports/asciidoc/reference-extractor';

/**
 * In-memory ReferenceExtractor fake for domain unit tests. Mirrors the shared
 * extraction's regexes closely enough to drive the cross-file refactoring use
 * cases over fixture content; the production wiring injects the real shared
 * `extractReferences` / `extractSymbols`.
 */
export class FakeReferenceExtractor implements ReferenceExtractor {
  extractReferences(fileId: string, content: string): Reference[] {
    const references: Reference[] = [];
    const push = (kind: Reference['kind'], target: string, index: number, length: number): void => {
      if (target.trim()) references.push({ kind, target: target.trim(), fileId, range: { from: index, to: index + length } });
    };
    for (const match of content.matchAll(/<<([^,>\n]+)(?:,[^>\n]*)?>>|xref:([^[\n]+)\[/g)) {
      push('xref', match[1] ?? match[2] ?? '', match.index ?? 0, match[0].length);
    }
    for (const match of content.matchAll(/^[ \t]*include::([^[\n]+)\[([^\]\n]*)\]/gm)) {
      push('include', match[1], match.index ?? 0, match[0].length);
    }
    for (const match of content.matchAll(/image::?([^[\n]+)\[/g)) {
      push('image', match[1], match.index ?? 0, match[0].length);
    }
    for (const match of content.matchAll(/\{([A-Za-z0-9][\w-]*)\}/g)) {
      push('attributeRef', match[1], match.index ?? 0, match[0].length);
    }
    return references;
  }

  extractSymbols(fileId: string, content: string): ProjectSymbol[] {
    const symbols: ProjectSymbol[] = [];
    for (const match of content.matchAll(/\[\[([A-Za-z][\w:.-]*)\]\]/g)) {
      symbols.push({ kind: 'anchor', name: match[1], fileId, range: { from: match.index ?? 0, to: (match.index ?? 0) + match[0].length } });
    }
    for (const match of content.matchAll(/^:([A-Za-z0-9][\w-]*):/gm)) {
      symbols.push({ kind: 'attribute', name: match[1], fileId, range: { from: match.index ?? 0, to: (match.index ?? 0) + match[0].length } });
    }
    return symbols;
  }
}
