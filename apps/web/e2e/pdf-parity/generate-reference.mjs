/**
 * @file Reusable reference-PDF generator for the PDF reference-parity corpus.
 *
 * Given a fixture directory, it runs the REAL, external Asciidoctor-PDF command-line toolchain inside
 * a pinned Docker container and writes the fixture's `reference.pdf` — the canonical output the in-app
 * client export is compared against. The gem version baked here is kept in lockstep with the version
 * the wasm engine bundles, so a same-source render by both toolchains should match tightly; using the
 * SAME theme, fonts, images-dir and attributes the in-app pipeline uses is what makes the comparison
 * meaningful rather than a comparison of two different documents.
 *
 * Usage:
 *   node apps/web/e2e/pdf-parity/generate-reference.mjs <fixture-dir> [<fixture-dir> ...]
 *   node apps/web/e2e/pdf-parity/generate-reference.mjs --all
 *
 * It reads each fixture's `manifest.json` (`mainFile`, and the `render` block that mirrors the in-app
 * ProjectSnapshot: `themePath`, `fontPaths`, `imagesDir`, `attributes`) and reconstructs the equivalent
 * CLI invocation. The container mounts only the fixture directory; there is no network use beyond the
 * one-time gem install captured in the reusable image.
 *
 * Requires Docker. The first run builds a small reusable image (`GEM_IMAGE`) that layers the pinned
 * gems onto `ruby:3.3`; subsequent runs reuse it, so regenerating the corpus is fast and deterministic.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(HERE, 'fixtures');

/** The Asciidoctor-PDF gem version the wasm engine bundles; the reference MUST use the same one. */
const GEM_VERSION = '2.3.24';
/** Supporting gems: SVG images (prawn-svg) and syntax highlighting (rouge), matching the engine set. */
const SUPPORT_GEMS = ['prawn-svg', 'rouge'];
/** The reusable image tag that layers the pinned gems onto the base Ruby image. */
const GEM_IMAGE = `asciidoc-pdf-reference:${GEM_VERSION}`;
const BASE_IMAGE = 'ruby:3.3';

/** Fixed epoch so the committed reference PDF's timestamps are reproducible across regenerations. */
const SOURCE_DATE_EPOCH = '1704067200'; // 2024-01-01T00:00:00Z

/** The mount point of the fixture directory inside the container. */
const WORK = '/work';
/** Sub-directory, inside a fixture, holding the AsciiDoc project source. */
const SOURCE_DIR_NAME = 'source';
/** The Asciidoctor-PDF token that expands to the gem's own bundled default fonts. */
const GEM_FONTS_TOKEN = 'GEM_FONTS_DIR';
/** The `pdf-fontsdir` entry separator Asciidoctor-PDF splits on (`;` or `,`, never `:`). */
const FONTS_DIR_SEPARATOR = ';';

function log(message) {
  process.stderr.write(`${message}\n`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) {
    throw result.error;
  }
  return result;
}

/** True when a Docker image with the given tag already exists locally. */
function imageExists(tag) {
  return run('docker', ['image', 'inspect', tag], { stdio: 'ignore' }).status === 0;
}

/**
 * Build the reusable gem image once. It installs the pinned Asciidoctor-PDF plus the support gems on
 * top of the base Ruby image so every reference render uses an identical, cached toolchain.
 */
function ensureGemImage() {
  if (imageExists(GEM_IMAGE)) {
    log(`Reusing gem image ${GEM_IMAGE}.`);
    return;
  }
  log(`Building gem image ${GEM_IMAGE} (one-time)...`);
  const gemList = [`asciidoctor-pdf -v ${GEM_VERSION}`, ...SUPPORT_GEMS].join(' && gem install ');
  const dockerfile = [
    `FROM ${BASE_IMAGE}`,
    `RUN gem install ${gemList}`,
  ].join('\n');
  const build = run('docker', ['build', '-t', GEM_IMAGE, '-'], { input: dockerfile, stdio: ['pipe', 'inherit', 'inherit'] });
  if (build.status !== 0) {
    throw new Error(`Failed to build ${GEM_IMAGE} (docker build exited ${String(build.status)}).`);
  }
}

function readManifest(fixtureDir) {
  const raw = readFileSync(join(fixtureDir, 'manifest.json'), 'utf8');
  const parsed = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Malformed manifest in ${fixtureDir}`);
  }
  return parsed;
}

/** Final path segment of a project-relative path. */
function leaf(path) {
  const parts = path.split('/').filter((segment) => segment.length > 0);
  return parts[parts.length - 1] ?? path;
}

/** Directory portion of a project-relative path (empty string for a top-level file). */
function dirPart(path) {
  const parts = path.split('/').filter((segment) => segment.length > 0);
  return parts.slice(0, -1).join('/');
}

/**
 * Build the `asciidoctor-pdf` attribute flags for a fixture, mirroring the in-app attribute builder:
 * `source-highlighter: rouge`, the project's `pdf-theme`/`pdf-themesdir`, a `pdf-fontsdir` combining
 * the project's own fonts with the gem's bundled defaults, `imagesdir`, and any explicit attributes.
 */
function attributeFlags(render) {
  const flags = ['-a', 'source-highlighter=rouge'];
  const sourceRoot = `${WORK}/${SOURCE_DIR_NAME}`;

  const themePath = typeof render.themePath === 'string' ? render.themePath : undefined;
  if (themePath !== undefined) {
    const themeDir = dirPart(themePath);
    const themesDir = themeDir.length > 0 ? `${sourceRoot}/${themeDir}` : sourceRoot;
    flags.push('-a', `pdf-theme=${leaf(themePath)}`, '-a', `pdf-themesdir=${themesDir}`);
  }

  const fontPaths = Array.isArray(render.fontPaths) ? render.fontPaths : [];
  if (fontPaths.length > 0) {
    const dirs = new Set();
    for (const fontPath of fontPaths) {
      const fontDir = dirPart(String(fontPath));
      dirs.add(fontDir.length > 0 ? `${sourceRoot}/${fontDir}` : sourceRoot);
    }
    const fontsDir = [...dirs, GEM_FONTS_TOKEN].join(FONTS_DIR_SEPARATOR);
    flags.push('-a', `pdf-fontsdir=${fontsDir}`);
  }

  if (typeof render.imagesDir === 'string') {
    flags.push('-a', `imagesdir=${render.imagesDir}`);
  }

  const attributes = render.attributes && typeof render.attributes === 'object' ? render.attributes : {};
  for (const [key, value] of Object.entries(attributes)) {
    flags.push('-a', value === null ? `${key}!` : `${key}=${String(value)}`);
  }

  // Zero out ambient timestamps so the committed reference PDF is reproducible.
  flags.push('-a', 'reproducible');
  return flags;
}

/** Generate (or regenerate) one fixture's reference.pdf. */
function generate(fixtureDir) {
  const manifest = readManifest(fixtureDir);
  const mainFile = typeof manifest.mainFile === 'string' ? manifest.mainFile : 'main.adoc';
  const referencePdf = typeof manifest.referencePdf === 'string' ? manifest.referencePdf : 'reference.pdf';
  const render = manifest.render && typeof manifest.render === 'object' ? manifest.render : {};

  const args = [
    'run', '--rm',
    '--network', 'none',
    '-e', `SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}`,
    '-v', `${fixtureDir}:${WORK}`,
    '-w', `${WORK}/${SOURCE_DIR_NAME}`,
    GEM_IMAGE,
    'asciidoctor-pdf',
    '-b', 'pdf',
    '-S', 'unsafe',
    ...attributeFlags(render),
    '-o', `${WORK}/${referencePdf}`,
    mainFile,
  ];

  log(`\n${basename(fixtureDir)}: asciidoctor-pdf ${args.slice(args.indexOf('asciidoctor-pdf') + 1).join(' ')}`);
  const result = run('docker', args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (result.status !== 0) {
    throw new Error(`Reference generation failed for ${fixtureDir} (docker run exited ${String(result.status)}).`);
  }
  const outPath = join(fixtureDir, referencePdf);
  if (!existsSync(outPath)) {
    throw new Error(`Reference generation reported success but ${outPath} is missing.`);
  }
  log(`Wrote ${relative(process.cwd(), outPath)} (${statSync(outPath).size} bytes).`);
}

function fixtureDirsFromArgs(argv) {
  if (argv.includes('--all')) {
    return readdirSync(FIXTURES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(FIXTURES_DIR, entry.name))
      .filter((dir) => existsSync(join(dir, 'manifest.json')));
  }
  return argv
    .filter((arg) => !arg.startsWith('--'))
    .map((arg) => (existsSync(join(arg, 'manifest.json')) ? arg : join(FIXTURES_DIR, arg)));
}

function main() {
  const dirs = fixtureDirsFromArgs(process.argv.slice(2));
  if (dirs.length === 0) {
    log('Usage: node generate-reference.mjs <fixture-dir> [...] | --all');
    process.exitCode = 1;
    return;
  }
  ensureGemImage();
  for (const dir of dirs) {
    generate(dir);
  }
  log('\nDone.');
}

main();
