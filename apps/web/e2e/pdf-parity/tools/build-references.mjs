/**
 * @file Builds the committed reference PDFs for the PDF-parity corpus using the EXTERNAL Asciidoctor-PDF
 * toolchain (the real gem plus its citation/diagram extensions), never the in-app wasm export. It runs
 * the pinned `adc-pdf-ref` Docker image (see Dockerfile.reference) over each fixture and writes the
 * reference PDF(s) back into the fixture directory.
 *
 * Reference fidelity by family:
 *   - code       : real asciidoctor-pdf with the rouge highlighter — a fully independent reference.
 *   - citations  : real asciidoctor-pdf + asciidoctor-bibtex over the shared .bib, one PDF per
 *                  (CSL style x ordering) variant — a fully independent reference.
 *   - math       : asciidoctor-mathematical will not build on this platform, so the reference is the
 *                  real gem embedding the SAME MathJax SVG assets the shim produces. The parity under
 *                  test is therefore the wasm engine's placement of the identical math asset vs the
 *                  reference gem's placement — a real engine-embedding check.
 *   - diagrams   : the real gem embedding the shim-produced SVG assets (engine-embedding parity).
 *
 * The math + diagrams shim SVGs need a browser (mermaid/MathJax), so their rewritten project (root doc
 * + placed `.gen/*.svg`) is produced once by emit-reference-inputs.spec.ts and committed under the
 * fixture's `reference-build/`. This tool renders code + citations directly, and re-renders math +
 * diagrams from that committed `reference-build/` (no browser needed to regenerate the reference PDF).
 *
 * All renders pass `-a reproducible` so the committed PDFs carry no wall-clock metadata.
 *
 * Usage:  node tools/build-references.mjs [code|citations|math|diagrams ...]   (default: all)
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, cpSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'fixtures');
const IMAGE = 'adc-pdf-ref:latest';

/** The (style, order) matrix the citations fixture is verified across: one numeric + one author-date CSL. */
const CITATION_VARIANTS = [
  { id: 'numeric-appearance', style: 'vancouver', order: 'appearance' },
  { id: 'numeric-alphabetical', style: 'vancouver', order: 'alphabetical' },
  { id: 'author-date-appearance', style: 'apa', order: 'appearance' },
  { id: 'author-date-alphabetical', style: 'apa', order: 'alphabetical' },
];

function run(args) {
  execFileSync('docker', args, { stdio: ['ignore', 'pipe', 'inherit'] });
}

/** Render one adoc in a throwaway work dir mounted into the reference image; copy the PDF back out. */
function renderInDocker(workDir, adocName, outName, extraArgs) {
  run([
    'run', '--rm', '-v', `${workDir}:/work`, '-w', '/work', IMAGE,
    'asciidoctor-pdf', '-a', 'reproducible', ...extraArgs, '-o', outName, adocName,
  ]);
}

function freshWorkDir() {
  return mkdtempSync(join(tmpdir(), 'pdfref-'));
}

function buildCode() {
  const dir = join(FIXTURES, 'code');
  const work = freshWorkDir();
  copyFileSync(join(dir, 'source', 'main.adoc'), join(work, 'main.adoc'));
  renderInDocker(work, 'main.adoc', 'reference.pdf', []);
  copyFileSync(join(work, 'reference.pdf'), join(dir, 'reference.pdf'));
  rmSync(work, { recursive: true, force: true });
  console.log('code: reference.pdf');
}

function buildCitations() {
  const dir = join(FIXTURES, 'citations');
  for (const variant of CITATION_VARIANTS) {
    const work = freshWorkDir();
    copyFileSync(join(dir, 'reference-src', 'main.adoc'), join(work, 'main.adoc'));
    copyFileSync(join(dir, 'source', 'refs.bib'), join(work, 'refs.bib'));
    renderInDocker(work, 'main.adoc', 'out.pdf', [
      '-r', 'asciidoctor-bibtex',
      '-a', `bibtex-style=${variant.style}`,
      '-a', `bibtex-order=${variant.order}`,
    ]);
    copyFileSync(join(work, 'out.pdf'), join(dir, `reference-${variant.id}.pdf`));
    rmSync(work, { recursive: true, force: true });
    console.log(`citations: reference-${variant.id}.pdf`);
  }
}

/** Re-render a fixture's reference PDF from its committed `reference-build/` (rewritten doc + assets). */
function buildFromReferenceBuild(fixtureName) {
  const dir = join(FIXTURES, fixtureName);
  const buildDir = join(dir, 'reference-build');
  if (!existsSync(join(buildDir, 'main.adoc'))) {
    console.log(`${fixtureName}: SKIPPED (no reference-build/ — run emit-reference-inputs.spec.ts with PARITY_EMIT=1)`);
    return;
  }
  const work = freshWorkDir();
  cpSync(buildDir, work, { recursive: true });
  renderInDocker(work, 'main.adoc', 'reference.pdf', []);
  copyFileSync(join(work, 'reference.pdf'), join(dir, 'reference.pdf'));
  rmSync(work, { recursive: true, force: true });
  console.log(`${fixtureName}: reference.pdf (real gem embedding shim SVG assets from reference-build/)`);
}

const targets = process.argv.slice(2);
const wanted = (name) => targets.length === 0 || targets.includes(name);

mkdirSync(FIXTURES, { recursive: true });
if (wanted('code')) buildCode();
if (wanted('citations')) buildCitations();
if (wanted('math')) buildFromReferenceBuild('math');
if (wanted('diagrams')) buildFromReferenceBuild('diagrams');
console.log('done.');
