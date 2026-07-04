import fs from 'node:fs';
import path from 'node:path';
import { buildParser } from '@lezer/generator';
import type { LRParser } from '@lezer/lr';
import type { Tree } from '@lezer/common';
import { createTestBlockTokenizer } from '../../helpers/asciidoc-test-tokenizer';

const grammarPath = path.resolve(__dirname, '../../../src/lib/codemirror/asciidoc.grammar');
const grammarSource = fs.readFileSync(grammarPath, 'utf8');

let parser: LRParser;
try {
  parser = buildParser(grammarSource, {
    externalTokenizer: (_name: string, terms: Record<string, number>) => createTestBlockTokenizer(terms),
  }) as LRParser;
} catch {
  parser = null as unknown as LRParser;
}

function parseDocument(text: string): Tree {
  return parser.parse(text);
}

function hasNode(tree: Tree, typeName: string): boolean {
  const cursor = tree.cursor();
  do {
    if (cursor.name === typeName) return true;
  } while (cursor.next());
  return false;
}

function nodeAt(tree: Tree, typeName: string, position: number): boolean {
  const cursor = tree.cursor();
  do {
    if (cursor.name === typeName && cursor.from <= position && cursor.to > position) return true;
  } while (cursor.next());
  return false;
}

function collectNodes(tree: Tree, typeName: string): Array<{ from: number; to: number }> {
  const results: Array<{ from: number; to: number }> = [];
  const cursor = tree.cursor();
  do {
    if (cursor.name === typeName) results.push({ from: cursor.from, to: cursor.to });
  } while (cursor.next());
  return results;
}

describe('AsciiDoc Lezer Grammar', () => {
  test('grammar compiles without error', () => {
    expect(parser).not.toBeNull();
  });

  // ── Document title ──────────────────────────────────────────────────────────

  describe('DocumentTitle', () => {
    test('recognises = Title at document start', () => {
      const tree = parseDocument('= My Document\n');
      expect(hasNode(tree, 'DocumentTitle')).toBe(true);
    });

    test('DocumentTitle node spans the entire title line', () => {
      const tree = parseDocument('= Hello World\n');
      const nodes = collectNodes(tree, 'DocumentTitle');
      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes[0].from).toBe(0);
    });
  });

  // ── Section headings ────────────────────────────────────────────────────────

  describe('Section headings', () => {
    test('recognises level-1 heading (== H2)', () => {
      const tree = parseDocument('== Introduction\n');
      expect(hasNode(tree, 'Heading1')).toBe(true);
    });

    test('recognises level-2 heading (=== H3)', () => {
      const tree = parseDocument('=== Background\n');
      expect(hasNode(tree, 'Heading2')).toBe(true);
    });

    test('recognises level-3 heading (==== H4)', () => {
      const tree = parseDocument('==== Details\n');
      expect(hasNode(tree, 'Heading3')).toBe(true);
    });

    test('recognises level-4 heading (===== H5)', () => {
      const tree = parseDocument('===== Sub-details\n');
      expect(hasNode(tree, 'Heading4')).toBe(true);
    });

    test('recognises level-5 heading (====== H6)', () => {
      const tree = parseDocument('====== Fine\n');
      expect(hasNode(tree, 'Heading5')).toBe(true);
    });

    test('heading node starts at position 0', () => {
      const tree = parseDocument('== My Heading\n');
      const nodes = collectNodes(tree, 'Heading1');
      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes[0].from).toBe(0);
    });
  });

  // ── Inline marks ────────────────────────────────────────────────────────────

  describe('Bold', () => {
    test('recognises constrained bold *text*', () => {
      const tree = parseDocument('Some *bold* text\n');
      expect(hasNode(tree, 'Bold')).toBe(true);
    });

    test('recognises unconstrained bold **text**', () => {
      const tree = parseDocument('Some **bold** text\n');
      expect(hasNode(tree, 'Bold')).toBe(true);
    });

    test('Bold node is positioned at the mark start', () => {
      const tree = parseDocument('Hello *world* end\n');
      expect(nodeAt(tree, 'Bold', 6)).toBe(true);
    });
  });

  describe('Italic', () => {
    test('recognises constrained italic _text_', () => {
      const tree = parseDocument('Some _italic_ text\n');
      expect(hasNode(tree, 'Italic')).toBe(true);
    });

    test('recognises unconstrained italic __text__', () => {
      const tree = parseDocument('Some __italic__ text\n');
      expect(hasNode(tree, 'Italic')).toBe(true);
    });
  });

  // ── Constrained / unconstrained boundary rules ────────────────────
  describe('Constrained boundary rules', () => {
    test('`a*b*c` does NOT form a Bold node (mark embedded in a word)', () => {
      expect(hasNode(parseDocument('a*b*c\n'), 'Bold')).toBe(false);
    });

    test('`2*3*4` does NOT form a Bold node', () => {
      expect(hasNode(parseDocument('2*3*4\n'), 'Bold')).toBe(false);
    });

    test('`x_y_z` does NOT form an Italic node', () => {
      expect(hasNode(parseDocument('x_y_z\n'), 'Italic')).toBe(false);
    });

    test('`a*b* c` with a trailing space inside still does not bold (opener abuts a word char)', () => {
      expect(hasNode(parseDocument('a*b* c\n'), 'Bold')).toBe(false);
    });

    test('genuine `*bold*` at a word boundary forms a Bold node', () => {
      expect(hasNode(parseDocument('a *bold* b\n'), 'Bold')).toBe(true);
    });

    test('unconstrained `a**b**c` forms a Bold node even mid-word', () => {
      expect(hasNode(parseDocument('a**b**c\n'), 'Bold')).toBe(true);
    });

    test('unconstrained `un__der__score` forms an Italic node mid-word', () => {
      expect(hasNode(parseDocument('un__der__score\n'), 'Italic')).toBe(true);
    });

    test('a constrained Bold with no closing mark does not bold the rest of the line', () => {
      expect(hasNode(parseDocument('a *unterminated word\n'), 'Bold')).toBe(false);
    });
  });

  describe('Monospace', () => {
    test('recognises monospace `code`', () => {
      const tree = parseDocument('Run `command` now\n');
      expect(hasNode(tree, 'Monospace')).toBe(true);
    });
  });

  describe('Highlight', () => {
    test('recognises highlight #text#', () => {
      const tree = parseDocument('This is #important# text\n');
      expect(hasNode(tree, 'Highlight')).toBe(true);
    });
  });

  describe('RoleSpan', () => {
    test('recognises a constrained role span [.lead]#text#', () => {
      const tree = parseDocument('A [.lead]#styled# span\n');
      expect(hasNode(tree, 'RoleSpan')).toBe(true);
    });

    test('recognises an unconstrained role span [.lead]##text##', () => {
      const tree = parseDocument('A [.lead]##styled##span\n');
      expect(hasNode(tree, 'RoleSpan')).toBe(true);
    });

    test('recognises a multi-role span [.role1.role2]#text#', () => {
      const tree = parseDocument('A [.big.red]#x# span\n');
      expect(hasNode(tree, 'RoleSpan')).toBe(true);
    });

    test('RoleSpan is positioned at the opening bracket', () => {
      const tree = parseDocument('A [.lead]#x# span\n');
      expect(nodeAt(tree, 'RoleSpan', 2)).toBe(true);
    });

    test('a plain `[note]` block-attr-looking fragment is NOT a RoleSpan', () => {
      const tree = parseDocument('see [note] here\n');
      expect(hasNode(tree, 'RoleSpan')).toBe(false);
    });
  });

  describe('Subscript', () => {
    test('recognises subscript ~text~', () => {
      const tree = parseDocument('H~2~O\n');
      expect(hasNode(tree, 'Subscript')).toBe(true);
    });
  });

  describe('Superscript', () => {
    test('recognises superscript ^text^', () => {
      const tree = parseDocument('E=mc^2^\n');
      expect(hasNode(tree, 'Superscript')).toBe(true);
    });
  });

  // ── Delimited blocks ────────────────────────────────────────────────────────

  describe('Listing block', () => {
    test('recognises ---- delimited listing block', () => {
      const tree = parseDocument('----\ncode here\n----\n');
      expect(hasNode(tree, 'ListingBlock')).toBe(true);
    });

    test('ListingBlock spans delimiter-to-delimiter', () => {
      const source = '----\ncode\n----\n';
      const tree = parseDocument(source);
      const nodes = collectNodes(tree, 'ListingBlock');
      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes[0].from).toBe(0);
      expect(nodes[0].to).toBeGreaterThanOrEqual(source.length - 1);
    });
  });

  describe('Example block', () => {
    test('recognises ==== delimited example block', () => {
      const tree = parseDocument('====\ncontent\n====\n');
      expect(hasNode(tree, 'ExampleBlock')).toBe(true);
    });
  });

  describe('Literal block', () => {
    test('recognises .... delimited literal block', () => {
      const tree = parseDocument('....\nliteral text\n....\n');
      expect(hasNode(tree, 'LiteralBlock')).toBe(true);
    });

    test('a marker-looking line inside the block is enclosed by the LiteralBlock', () => {
      // '....\n' is offsets 0-4; '* x' starts at offset 5. The bullet line must resolve to an
      // ancestor LiteralBlock and must NOT produce a sibling UnorderedListItem — this is what
      // makes the command's ancestor-walk suppression sound.
      const tree = parseDocument('....\n* x\n....\n');
      expect(nodeAt(tree, 'LiteralBlock', 6)).toBe(true);
      expect(hasNode(tree, 'UnorderedListItem')).toBe(false);
    });

    test('.... followed by a space is still an ordered list item (depth 4), not a literal block', () => {
      const tree = parseDocument('.... item\n');
      expect(hasNode(tree, 'OrderedListItem')).toBe(true);
      expect(hasNode(tree, 'LiteralBlock')).toBe(false);
    });
  });

  describe('Sidebar block', () => {
    test('recognises **** delimited sidebar block', () => {
      const tree = parseDocument('****\ncontent\n****\n');
      expect(hasNode(tree, 'SidebarBlock')).toBe(true);
    });

    // Reported bug: a sidebar delimiter glued directly under a prose line (NO blank line) must still
    // open the block. Asciidoctor's `block_terminates_paragraph` rule ends the paragraph at the `****`
    // delimiter (verified: `sdfsdf\n****\n…` renders a <p> followed by a separate <div class=
    // "sidebarblock">), so the editor must not absorb the delimiter into the paragraph.
    test('recognises a **** sidebar block glued to a preceding prose line (no blank line)', () => {
      const tree = parseDocument('sdfsdf\n****\nSidebar block\n****\n');
      expect(hasNode(tree, 'SidebarBlock')).toBe(true);
    });
  });

  // A delimited-block delimiter terminates an open paragraph even with no blank line between them
  // (Asciidoctor `block_terminates_paragraph`). Unlike a section heading or list marker — which a
  // paragraph DOES absorb — these fenced delimiters always start their block.
  describe('delimited block terminates a preceding paragraph (no blank line)', () => {
    const cases: Array<[string, string]> = [
      ['ExampleBlock', 'prose\n====\nbody\n====\n'],
      ['ListingBlock', 'prose\n----\nbody\n----\n'],
      ['LiteralBlock', 'prose\n....\nbody\n....\n'],
      ['QuoteBlock', 'prose\n____\nbody\n____\n'],
      ['PassthroughBlock', 'prose\n++++\nbody\n++++\n'],
      ['OpenBlock', 'prose\n--\nbody\n--\n'],
      ['CommentBlock', 'prose\n////\nhidden\n////\n'],
      ['TableBlock', 'prose\n|===\n| a | b\n|===\n'],
      ['CsvTableBlock', 'prose\n,===\na,b\n,===\n'],
      ['DsvTableBlock', 'prose\n:===\na:b\n:===\n'],
    ];
    for (const [node, source] of cases) {
      test(`${node} opens when glued under prose`, () => {
        expect(hasNode(parseDocument(source), node)).toBe(true);
      });
    }
  });

  // A line containing ONLY whitespace (spaces/tabs) is a blank line in AsciiDoc — it separates
  // blocks exactly like a truly empty line. Reported bug: trailing whitespace on the separating line
  // was absorbed as paragraph text, so the following block (admonition, stem, list, delimited block…)
  // did not start a new block.
  // An empty list item (`. ` / `* ` with no text on the marker line) must not break the list: the
  // glued following line is the item's principal-text continuation, not a new paragraph.
  describe('empty list item keeps the list (continuation, not a paragraph)', () => {
    test('an ordered list survives an empty `. ` item and continues', () => {
      const tree = parseDocument('. part of list\n. \nstill part of list\n');
      expect(collectNodes(tree, 'OrderedListItem')).toHaveLength(2);
      expect(hasNode(tree, 'Continuation')).toBe(true);
      expect(hasNode(tree, 'Paragraph')).toBe(false);
    });

    test('an unordered list survives an empty `* ` item and continues', () => {
      const tree = parseDocument('* part of list\n* \nstill part of list\n');
      expect(collectNodes(tree, 'UnorderedListItem')).toHaveLength(2);
      expect(hasNode(tree, 'Continuation')).toBe(true);
      expect(hasNode(tree, 'Paragraph')).toBe(false);
    });
  });

  // An admonition paragraph (`NOTE: …`) absorbs glued following lines like any paragraph, so a
  // heading marker on the next line (no blank between) is plain admonition text, NOT a section title.
  describe('admonition paragraph absorbs glued continuation lines', () => {
    test('glued lines under NOTE: are admonition continuation, not a heading', () => {
      const tree = parseDocument('NOTE: One of five built-in admonition block types.\n== This is not a title yet\nanother line\n');
      expect(hasNode(tree, 'Heading1')).toBe(false);
      // NOTE: now produces AdmonitionNoteParagraph (per-severity split)
      const hasAdmon = hasNode(tree, 'AdmonitionParagraph') || hasNode(tree, 'AdmonitionNoteParagraph');
      expect(hasAdmon).toBe(true);
      // The glued lines belong to the admonition (their own node so they inherit the admonition tag),
      // not the plain ParagraphContinuation — so the whole NOTE block highlights as one admonition.
      expect(collectNodes(tree, 'AdmonitionContinuation')).toHaveLength(2);
      expect(hasNode(tree, 'ParagraphContinuation')).toBe(false);
    });

    test('a heading after a BLANK line below NOTE: is still a heading', () => {
      expect(hasNode(parseDocument('NOTE: an admonition.\n\n== A Real Title\n'), 'Heading1')).toBe(true);
    });

    test('a delimited block glued under NOTE: still opens (block terminates paragraph)', () => {
      expect(hasNode(parseDocument('NOTE: an admonition.\n----\ncode\n----\n'), 'ListingBlock')).toBe(true);
    });
  });

  // Heading markers are 1–6 `=` (levels 0–5). A run of 7+ `=` then space+text is NOT a heading — it
  // is plain text. Reported regression: `=================== Not a Section` was tokenized as Heading5.
  describe('a run of 7+ equals is not a heading', () => {
    test('19 equals + text is a Paragraph, not a heading', () => {
      const tree = parseDocument('=================== Not a Section\n');
      expect(hasNode(tree, 'Heading5')).toBe(false);
      expect(hasNode(tree, 'DocumentTitle')).toBe(false);
      expect(hasNode(tree, 'Paragraph')).toBe(true);
    });

    test('7 equals + text is a Paragraph, not a heading', () => {
      const tree = parseDocument('======= Too deep to be a section\n');
      expect(hasNode(tree, 'Heading5')).toBe(false);
      expect(hasNode(tree, 'Paragraph')).toBe(true);
    });

    test('exactly 6 equals + text is still a level-5 heading (no regression)', () => {
      expect(hasNode(parseDocument('====== Deep section\n'), 'Heading5')).toBe(true);
    });

    test('a bare run of 4+ equals (no text) is still an example-block delimiter', () => {
      expect(hasNode(parseDocument('====\nbody\n====\n'), 'ExampleBlock')).toBe(true);
    });
  });

  // A section title must have actual title text. `== ` with an empty (or whitespace-only) title is a
  // paragraph in Asciidoctor, and the outline's HEADING_RE (`^(={1,6})\s+\S`) already omits it — the
  // tokenizer must agree so the editor highlight and the Outline panel never disagree.
  describe('an empty-title heading marker is not a heading', () => {
    test('`== ` with no title text is a Paragraph, not a Heading1', () => {
      const tree = parseDocument('== \n');
      expect(hasNode(tree, 'Heading1')).toBe(false);
    });

    test('`= ` with no title text is not a DocumentTitle', () => {
      expect(hasNode(parseDocument('= \n'), 'DocumentTitle')).toBe(false);
    });

    test('`==   ` with only whitespace after the marker is not a Heading1', () => {
      expect(hasNode(parseDocument('==   \n'), 'Heading1')).toBe(false);
    });

    test('`== Real` with title text is still a Heading1 (no regression)', () => {
      expect(hasNode(parseDocument('== Real\n'), 'Heading1')).toBe(true);
    });

    test('`==   Spaced` with extra leading spaces before the title is still a Heading1', () => {
      expect(hasNode(parseDocument('==   Spaced\n'), 'Heading1')).toBe(true);
    });

    // The marker may be separated from the title by a TAB as well as a space (Asciidoctor `[ \t]+`),
    // matching the outline's `\s+` so the editor highlight and the Outline panel agree.
    test('`==\\tTabbed` with a tab after the marker is a Heading1', () => {
      expect(hasNode(parseDocument('==\tTabbed\n'), 'Heading1')).toBe(true);
    });

    test('`=\\tTitle` with a tab after the marker is a DocumentTitle', () => {
      expect(hasNode(parseDocument('=\tTitle\n'), 'DocumentTitle')).toBe(true);
    });

    test('`==\\t` with only a tab and no title text is not a Heading1', () => {
      expect(hasNode(parseDocument('==\t\n'), 'Heading1')).toBe(false);
    });
  });

  describe('whitespace-only line is a blank line (block separator)', () => {
    test('AdmonitionParagraph starts after a whitespace-only line', () => {
      const tree = parseDocument('Intro.\n   \nNOTE: an admonition follows a spaces-only line.\n');
      const hasAdmon = hasNode(tree, 'AdmonitionParagraph') || hasNode(tree, 'AdmonitionNoteParagraph');
      expect(hasAdmon).toBe(true);
    });

    test('AdmonitionParagraph (tab) starts after a whitespace-only line', () => {
      const tree = parseDocument('Intro.\n\t\nNOTE: an admonition follows a tab-only line.\n');
      const hasAdmon = hasNode(tree, 'AdmonitionParagraph') || hasNode(tree, 'AdmonitionNoteParagraph');
      expect(hasAdmon).toBe(true);
    });

    test.each([
      ['InlineStem', 'Intro.\n   \nEuler: stem:[e^(i*pi) + 1 = 0].\n'],
      ['UnorderedListItem', 'Intro.\n   \n* a list item after a spaces-only line\n'],
      ['ListingBlock', 'Intro.\n   \n----\ncode\n----\n'],
    ])('%s starts after a whitespace-only line', (node, source) => {
      expect(hasNode(parseDocument(source), node)).toBe(true);
    });

    test('a truly empty line still separates blocks (no regression)', () => {
      const tree = parseDocument('Intro.\n\nNOTE: still an admonition.\n');
      const hasAdmon = hasNode(tree, 'AdmonitionParagraph') || hasNode(tree, 'AdmonitionNoteParagraph');
      expect(hasAdmon).toBe(true);
    });

    test('an INDENTED non-empty line is NOT treated as blank (stays a paragraph)', () => {
      expect(hasNode(parseDocument('   indented prose, not a blank line\n'), 'Paragraph')).toBe(true);
    });
  });

  describe('Quote block', () => {
    test('recognises ____ delimited quote block', () => {
      const tree = parseDocument('____\nquoted text\n____\n');
      expect(hasNode(tree, 'QuoteBlock')).toBe(true);
    });
  });

  describe('Passthrough block', () => {
    test('recognises ++++ delimited passthrough block', () => {
      const tree = parseDocument('++++\n<b>raw html</b>\n++++\n');
      expect(hasNode(tree, 'PassthroughBlock')).toBe(true);
    });
  });

  describe('Open block', () => {
    test('recognises -- delimited open block', () => {
      const tree = parseDocument('--\ncontent\n--\n');
      expect(hasNode(tree, 'OpenBlock')).toBe(true);
    });
  });

  describe('STEM block', () => {
    test('recognises [stem] annotated ++++ block', () => {
      const tree = parseDocument('[stem]\n++++\nx^2 + y^2\n++++\n');
      expect(hasNode(tree, 'StemBlock')).toBe(true);
    });
  });

  describe('Comment block', () => {
    test('recognises //// delimited comment block', () => {
      const tree = parseDocument('////\ncommented out\n////\n');
      expect(hasNode(tree, 'CommentBlock')).toBe(true);
    });
  });

  // ── Comment lines ────────────────────────────────────────────────────────────

  describe('CommentLine', () => {
    test('recognises // comment line', () => {
      const tree = parseDocument('// This is a comment\n');
      expect(hasNode(tree, 'CommentLine')).toBe(true);
    });

    test('CommentLine node starts at position 0', () => {
      const tree = parseDocument('// comment\n');
      const nodes = collectNodes(tree, 'CommentLine');
      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes[0].from).toBe(0);
    });
  });

  // ── Attributes ───────────────────────────────────────────────────────────────

  describe('AttributeEntry', () => {
    test('recognises :attr-name: value', () => {
      const tree = parseDocument(':author: Jane Doe\n');
      expect(hasNode(tree, 'AttributeEntry')).toBe(true);
    });

    test('AttributeEntry spans the full line', () => {
      const source = ':version: 1.0\n';
      const tree = parseDocument(source);
      const nodes = collectNodes(tree, 'AttributeEntry');
      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes[0].from).toBe(0);
    });
  });

  describe('AttributeReference', () => {
    test('recognises {attr} reference in text', () => {
      const tree = parseDocument('Version {version} released\n');
      expect(hasNode(tree, 'AttributeReference')).toBe(true);
    });

    test('AttributeReference is positioned at the brace start', () => {
      const tree = parseDocument('Hello {name}\n');
      expect(nodeAt(tree, 'AttributeReference', 6)).toBe(true);
    });
  });

  // ── Macros ───────────────────────────────────────────────────────────────────

  describe('BlockMacro', () => {
    test('recognises image:: block macro', () => {
      const tree = parseDocument('image::path/to/image.png[Alt text]\n');
      expect(hasNode(tree, 'BlockMacro')).toBe(true);
    });

    test('recognises video:: block macro', () => {
      const tree = parseDocument('video::video.mp4[]\n');
      expect(hasNode(tree, 'BlockMacro')).toBe(true);
    });

    test('recognises include:: block macro', () => {
      const tree = parseDocument('include::chapter1.adoc[]\n');
      expect(hasNode(tree, 'BlockMacro')).toBe(true);
    });
  });

  describe('InlineMacro', () => {
    test('recognises link: inline macro', () => {
      const tree = parseDocument('Visit link:https://example.com[the site]\n');
      expect(hasNode(tree, 'InlineMacro')).toBe(true);
    });

    test('recognises image: inline macro', () => {
      const tree = parseDocument('See image:icon.png[icon] for reference\n');
      expect(hasNode(tree, 'InlineMacro')).toBe(true);
    });
  });

  // ── Cross-references ─────────────────────────────────────────────────────────

  describe('CrossReference', () => {
    test('recognises <<id>> cross-reference', () => {
      const tree = parseDocument('See <<section-id>> for details\n');
      expect(hasNode(tree, 'CrossReference')).toBe(true);
    });

    test('recognises <<id,label>> cross-reference with label', () => {
      const tree = parseDocument('See <<intro,Introduction>> for details\n');
      expect(hasNode(tree, 'CrossReference')).toBe(true);
    });

    test('CrossReference is positioned at <<', () => {
      const tree = parseDocument('See <<intro>>\n');
      expect(nodeAt(tree, 'CrossReference', 4)).toBe(true);
    });

    test('a labelled xref distinguishes target from label sub-nodes', () => {
      const source = 'See <<intro,Introduction>>\n';
      const tree = parseDocument(source);
      // Target sub-node covers the tail of `intro` (offset 8 — the opener consumes `<<` + the first
      // id char as a guard); label sub-node covers `Introduction`.
      expect(nodeAt(tree, 'XrefTarget', 8)).toBe(true);
      expect(nodeAt(tree, 'XrefLabel', source.indexOf('Introduction'))).toBe(true);
    });

    test('a bare xref has a target sub-node and no label sub-node', () => {
      const tree = parseDocument('See <<intro>>\n');
      expect(nodeAt(tree, 'XrefTarget', 8)).toBe(true);
      expect(hasNode(tree, 'XrefLabel')).toBe(false);
    });
  });

  // ── Table column specifiers ──────────────────────────────────────
  describe('Table cols specifier', () => {
    test('`[cols="1,>2"]` tokenizes a TableCols sub-node', () => {
      const tree = parseDocument('[cols="1,>2"]\n');
      expect(hasNode(tree, 'TableCols')).toBe(true);
    });

    test('the TableCols sub-node covers the cols value', () => {
      const source = '[cols="1,1,1"]\n';
      const tree = parseDocument(source);
      // The value `1,1,1` begins at offset 7 (after `[cols="`).
      expect(nodeAt(tree, 'TableCols', 8)).toBe(true);
    });

    test('a non-cols block-attribute line has no TableCols node', () => {
      expect(hasNode(parseDocument('[source,ruby]\n'), 'TableCols')).toBe(false);
    });
  });

  // ── Footnotes ─────────────────────────────────────────────────────────────────

  describe('Footnote', () => {
    test('recognises footnote:[text] macro', () => {
      const tree = parseDocument('Some text footnote:[This is a note]\n');
      expect(hasNode(tree, 'Footnote')).toBe(true);
    });
  });

  // ── List items ───────────────────────────────────────────────────────────────

  describe('OrderedListItem', () => {
    test('recognises . ordered list item', () => {
      const tree = parseDocument('. First item\n');
      expect(hasNode(tree, 'OrderedListItem')).toBe(true);
    });

    test('recognises multi-level .. ordered list item', () => {
      const tree = parseDocument('.. Nested item\n');
      expect(hasNode(tree, 'OrderedListItem')).toBe(true);
    });

    test('recognises explicit-number `1.` ordered list item', () => {
      const tree = parseDocument('1. Step\n');
      expect(hasNode(tree, 'OrderedListItem')).toBe(true);
    });

    test('recognises multi-digit explicit `12.` ordered list item', () => {
      const tree = parseDocument('12. Step\n');
      expect(hasNode(tree, 'OrderedListItem')).toBe(true);
    });

    test('`....` line-only remains a LiteralBlock, not ordered', () => {
      const tree = parseDocument('....\nx\n....\n');
      expect(hasNode(tree, 'LiteralBlock')).toBe(true);
    });
  });

  describe('UnorderedListItem', () => {
    test('recognises * unordered list item', () => {
      const tree = parseDocument('* First bullet\n');
      expect(hasNode(tree, 'UnorderedListItem')).toBe(true);
    });

    test('recognises ** nested unordered list item', () => {
      const tree = parseDocument('** Nested bullet\n');
      expect(hasNode(tree, 'UnorderedListItem')).toBe(true);
    });
  });

  describe('CheckTodoItem / CheckDoneItem', () => {
    test('recognises * [ ] unchecked checklist item as CheckTodoItem', () => {
      expect(hasNode(parseDocument('* [ ] Unchecked task\n'), 'CheckTodoItem')).toBe(true);
    });

    test('recognises * [x] checked checklist item as CheckDoneItem', () => {
      expect(hasNode(parseDocument('* [x] Checked task\n'), 'CheckDoneItem')).toBe(true);
    });

    test('recognises * [X] checked checklist item (uppercase) as CheckDoneItem', () => {
      expect(hasNode(parseDocument('* [X] Done task\n'), 'CheckDoneItem')).toBe(true);
    });

    test('recognises dash `- [ ]` unchecked checklist item as CheckTodoItem', () => {
      expect(hasNode(parseDocument('- [ ] task\n'), 'CheckTodoItem')).toBe(true);
    });

    test('recognises dash `- [x]` checked checklist item as CheckDoneItem', () => {
      expect(hasNode(parseDocument('- [x] task\n'), 'CheckDoneItem')).toBe(true);
    });
  });

  describe('DescriptionList', () => {
    test('recognises term:: definition standard description list', () => {
      const tree = parseDocument('CPU:: The central processing unit\n');
      expect(hasNode(tree, 'DescriptionList')).toBe(true);
    });

    test('recognises term::: triple-colon description list', () => {
      const tree = parseDocument('term::: definition\n');
      expect(hasNode(tree, 'DescriptionList')).toBe(true);
    });

    test('recognises `Term;; Detail` semicolon description list', () => {
      const tree = parseDocument('Term;; Detail\n');
      expect(hasNode(tree, 'DescriptionList')).toBe(true);
    });
  });

  // ── Tables ───────────────────────────────────────────────────────────────────

  describe('TableBlock', () => {
    test('recognises |=== delimited table', () => {
      const tree = parseDocument('|===\n| Col1 | Col2\n| a | b\n|===\n');
      expect(hasNode(tree, 'TableBlock')).toBe(true);
    });

    test('spans the full table when a blank line separates header from body rows', () => {
      // |===\n        offsets 0-4
      // |H1 |H2\n    offsets 5-12
      // \n            offset  13 (blank line — header/body separator)
      // |C1 |C2\n    offsets 14-21
      // |===\n        offsets 22-26
      const document = '|===\n|H1 |H2\n\n|C1 |C2\n|===\n';
      const tree = parseDocument(document);
      const blocks = collectNodes(tree, 'TableBlock');
      expect(blocks).toHaveLength(1);
      // Body row starts at offset 14; the TableBlock node must cover that position.
      expect(nodeAt(tree, 'TableBlock', 15)).toBe(true);
    });
  });

  // ── Admonitions ──────────────────────────────────────────────────────────────

  describe('AdmonitionParagraph', () => {
    test('recognises NOTE: admonition paragraph', () => {
      const tree = parseDocument('NOTE: Pay attention here\n');
      const hasAdmon = hasNode(tree, 'AdmonitionParagraph') || hasNode(tree, 'AdmonitionNoteParagraph');
      expect(hasAdmon).toBe(true);
    });

    test('recognises TIP: admonition paragraph', () => {
      const tree = parseDocument('TIP: A useful hint\n');
      const hasAdmon = hasNode(tree, 'AdmonitionParagraph') || hasNode(tree, 'AdmonitionTipParagraph');
      expect(hasAdmon).toBe(true);
    });

    test('recognises WARNING: admonition paragraph', () => {
      const tree = parseDocument('WARNING: Be careful\n');
      const hasAdmon = hasNode(tree, 'AdmonitionParagraph') || hasNode(tree, 'AdmonitionWarningParagraph');
      expect(hasAdmon).toBe(true);
    });

    test('recognises IMPORTANT: admonition paragraph', () => {
      const tree = parseDocument('IMPORTANT: Must do this\n');
      const hasAdmon = hasNode(tree, 'AdmonitionParagraph') || hasNode(tree, 'AdmonitionImportantParagraph');
      expect(hasAdmon).toBe(true);
    });

    test('recognises CAUTION: admonition paragraph', () => {
      const tree = parseDocument('CAUTION: Watch out\n');
      const hasAdmon = hasNode(tree, 'AdmonitionParagraph') || hasNode(tree, 'AdmonitionCautionParagraph');
      expect(hasAdmon).toBe(true);
    });
  });

  describe('AdmonitionBlock', () => {
    test('recognises [NOTE] block-style admonition', () => {
      const tree = parseDocument('[NOTE]\n====\nThis is a note block\n====\n');
      const hasAdmon = hasNode(tree, 'AdmonitionBlock') || hasNode(tree, 'AdmonitionNoteBlock');
      expect(hasAdmon).toBe(true);
    });

    test('recognises [WARNING] block-style admonition', () => {
      const tree = parseDocument('[WARNING]\n====\nDanger!\n====\n');
      const hasAdmon = hasNode(tree, 'AdmonitionBlock') || hasNode(tree, 'AdmonitionWarningBlock');
      expect(hasAdmon).toBe(true);
    });
  });

  // ── Complex document ──────────────────────────────────────────────────────────

  describe('Complex document', () => {
    const complexDocument = `= My Document
:author: Jane Doe
:version: 1.0

== Introduction

This is *bold* and _italic_ and \`monospace\` text.

Version {version} was released.

See <<intro>> for details.

=== Lists

. First
. Second

* Bullet one
* Bullet two

* [ ] Todo item
* [x] Done item

CPU:: Processing unit

|===
| Name | Value
| CPU  | Fast
|===

NOTE: Pay attention here

// This is a comment

////
Block comment
////

----
code block
----

====
example block
====
`;

    test('complex document parses without throwing', () => {
      expect(() => parseDocument(complexDocument)).not.toThrow();
    });

    test('complex document contains DocumentTitle', () => {
      expect(hasNode(parseDocument(complexDocument), 'DocumentTitle')).toBe(true);
    });

    test('complex document contains AttributeEntry nodes', () => {
      expect(hasNode(parseDocument(complexDocument), 'AttributeEntry')).toBe(true);
    });

    test('complex document contains Heading1 nodes', () => {
      expect(hasNode(parseDocument(complexDocument), 'Heading1')).toBe(true);
    });

    test('complex document contains Bold nodes', () => {
      expect(hasNode(parseDocument(complexDocument), 'Bold')).toBe(true);
    });

    test('complex document contains Italic nodes', () => {
      expect(hasNode(parseDocument(complexDocument), 'Italic')).toBe(true);
    });

    test('complex document contains Monospace nodes', () => {
      expect(hasNode(parseDocument(complexDocument), 'Monospace')).toBe(true);
    });

    test('complex document contains AttributeReference nodes', () => {
      expect(hasNode(parseDocument(complexDocument), 'AttributeReference')).toBe(true);
    });

    test('complex document contains CrossReference nodes', () => {
      expect(hasNode(parseDocument(complexDocument), 'CrossReference')).toBe(true);
    });

    test('complex document contains OrderedListItem nodes', () => {
      expect(hasNode(parseDocument(complexDocument), 'OrderedListItem')).toBe(true);
    });

    test('complex document contains UnorderedListItem nodes', () => {
      expect(hasNode(parseDocument(complexDocument), 'UnorderedListItem')).toBe(true);
    });

    test('complex document contains CheckDoneItem or CheckTodoItem nodes', () => {
      const tree = parseDocument(complexDocument);
      expect(hasNode(tree, 'CheckDoneItem') || hasNode(tree, 'CheckTodoItem')).toBe(true);
    });

    test('complex document contains DescriptionList nodes', () => {
      expect(hasNode(parseDocument(complexDocument), 'DescriptionList')).toBe(true);
    });

    test('complex document contains TableBlock nodes', () => {
      expect(hasNode(parseDocument(complexDocument), 'TableBlock')).toBe(true);
    });

    test('complex document contains AdmonitionParagraph nodes', () => {
      const tree = parseDocument(complexDocument);
      const hasAdmon = hasNode(tree, 'AdmonitionParagraph') ||
        hasNode(tree, 'AdmonitionNoteParagraph') || hasNode(tree, 'AdmonitionTipParagraph') ||
        hasNode(tree, 'AdmonitionWarningParagraph') || hasNode(tree, 'AdmonitionImportantParagraph') ||
        hasNode(tree, 'AdmonitionCautionParagraph');
      expect(hasAdmon).toBe(true);
    });

    test('complex document contains CommentLine nodes', () => {
      expect(hasNode(parseDocument(complexDocument), 'CommentLine')).toBe(true);
    });

    test('complex document contains CommentBlock nodes', () => {
      expect(hasNode(parseDocument(complexDocument), 'CommentBlock')).toBe(true);
    });

    test('complex document contains ListingBlock nodes', () => {
      expect(hasNode(parseDocument(complexDocument), 'ListingBlock')).toBe(true);
    });

    test('complex document contains ExampleBlock nodes', () => {
      expect(hasNode(parseDocument(complexDocument), 'ExampleBlock')).toBe(true);
    });
  });

  // ── Checkbox markers ──────────────────────────────────────────────────────────
  describe('Checklist markers', () => {
    test.each([['* [ ] todo\n', 'CheckTodoItem'], ['* [x] done\n', 'CheckDoneItem'], ['* [X] done\n', 'CheckDoneItem'], ['* [*] done\n', 'CheckDoneItem']])(
      'recognises %j as a %s',
      (input, nodeName) => {
        expect(hasNode(parseDocument(input), nodeName)).toBe(true);
      },
    );

    test('the checked `[*]` marker does not open inline Bold', () => {
      const tree = parseDocument('* [*] some text\n');
      expect(hasNode(tree, 'CheckDoneItem')).toBe(true);
      expect(hasNode(tree, 'Bold')).toBe(false);
    });

    test('dash checklist `- [*] ` is recognised', () => {
      expect(hasNode(parseDocument('- [*] done\n'), 'CheckDoneItem')).toBe(true);
    });
  });

  // ── List / description continuation ────────────────────────────────────────────
  describe('Principal-text continuation', () => {
    test('a wrapped ordered list item absorbs the next line as Continuation', () => {
      const tree = parseDocument('. part of list\nstill part of list\n');
      expect(collectNodes(tree, 'Continuation').length).toBe(1);
      // The second line belongs to the OrderedListItem, not a standalone Paragraph.
      expect(nodeAt(tree, 'OrderedListItem', 20)).toBe(true);
      expect(hasNode(tree, 'Paragraph')).toBe(false);
    });

    test('a wrapped unordered list item absorbs the next line', () => {
      const tree = parseDocument('* part of list\nstill part of list\n');
      expect(nodeAt(tree, 'UnorderedListItem', 20)).toBe(true);
      expect(hasNode(tree, 'Paragraph')).toBe(false);
    });

    test('a wrapped checklist item absorbs the next line', () => {
      const tree = parseDocument('* [x] part\nstill part\n');
      expect(nodeAt(tree, 'CheckDoneItem', 13)).toBe(true);
      expect(hasNode(tree, 'Paragraph')).toBe(false);
    });

    test('a wrapped description list entry absorbs the next line', () => {
      const tree = parseDocument('Title:: part of description\nstill part of description\n');
      // Description continuations use a distinct node so they inherit the label colour.
      expect(collectNodes(tree, 'DescriptionContinuation').length).toBe(1);
      expect(nodeAt(tree, 'DescriptionList', 35)).toBe(true);
      expect(hasNode(tree, 'Paragraph')).toBe(false);
    });

    test('a blank line ends the continuation', () => {
      const tree = parseDocument('. item\ncontinued\n\nA new paragraph.\n');
      expect(collectNodes(tree, 'Continuation').length).toBe(1);
      // The text after the blank line is its own Paragraph, not part of the list item.
      expect(hasNode(tree, 'Paragraph')).toBe(true);
    });

    test('plain consecutive paragraph lines do NOT produce Continuation nodes', () => {
      const tree = parseDocument('Just a paragraph.\nSecond line.\n');
      expect(hasNode(tree, 'Continuation')).toBe(false);
    });
  });

  // ── Indented list markers ───────────────────────────────────────────────────────
  describe('Leading-whitespace list markers', () => {
    test.each([
      [' * indented unordered\n', 'UnorderedListItem'],
      ['  . indented ordered\n', 'OrderedListItem'],
      ['  1. indented numbered\n', 'OrderedListItem'],
    ])('recognises %j as %s', (input, nodeType) => {
      expect(hasNode(parseDocument(input), nodeType)).toBe(true);
    });

    test(String.raw`recognises "  * [x] indented checklist\n" as CheckDoneItem`, () => {
      expect(hasNode(parseDocument('  * [x] indented checklist\n'), 'CheckDoneItem')).toBe(true);
    });

    test('an indented list item still absorbs its continuation line', () => {
      const tree = parseDocument(' * part of list\nstill part of list\n');
      expect(nodeAt(tree, 'UnorderedListItem', 20)).toBe(true);
      expect(hasNode(tree, 'Paragraph')).toBe(false);
    });

    test('indented plain text is not mistaken for a list', () => {
      expect(hasNode(parseDocument('   just indented text\n'), 'UnorderedListItem')).toBe(false);
    });
  });

  // ── Block constructs only at a block boundary ───────────────────────────────────
  describe('Mid-paragraph markers are plain text', () => {
    test('heading/list markers after a paragraph line are paragraph continuation, not blocks', () => {
      const tree = parseDocument('a line\n== This is not a title yet\nanother line\n. this is not a list yet\n');
      expect(hasNode(tree, 'Heading1')).toBe(false);
      expect(hasNode(tree, 'Heading2')).toBe(false);
      expect(hasNode(tree, 'OrderedListItem')).toBe(false);
      expect(collectNodes(tree, 'Paragraph').length).toBe(1);
      expect(collectNodes(tree, 'ParagraphContinuation').length).toBe(3);
    });

    test('a heading IS recognised at a block boundary (after a blank line)', () => {
      expect(hasNode(parseDocument('para\n\n== Real Title\n'), 'Heading1')).toBe(true);
    });

    test('a list item after a paragraph line stays paragraph text', () => {
      const tree = parseDocument('para\n* item\n');
      expect(hasNode(tree, 'UnorderedListItem')).toBe(false);
      expect(nodeAt(tree, 'Paragraph', 8)).toBe(true);
    });

    test('consecutive list items are still siblings (the list started as a list)', () => {
      expect(collectNodes(parseDocument('* one\n* two\n'), 'UnorderedListItem').length).toBe(2);
    });
  });
});
