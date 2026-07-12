/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@asciidocollab/asciidoc-core',
    '@asciidocollab/asciidoc-pdf',
    '@asciidocollab/shared',
    '@dicebear/core',
    '@dicebear/styles',
  ],
  // Asciidoctor-PDF WebAssembly engine — asset handling:
  //
  // The engine is a large `.wasm` blob vendored into public/vendor/asciidoctor-pdf/ and fetched +
  // instantiated at runtime by the PDF worker. As a file under public/ it is served verbatim
  // same-origin with the correct application/wasm type, so it needs no bundler loader — it is never
  // imported into the module graph. Any `.wasm` that IS imported by a worker shim is handled
  // natively by the bundler's WebAssembly support (async instantiation), so no custom rule is added.
  //
  // No COOP/COEP cross-origin-isolation headers: the engine uses the single-threaded ruby.wasm build,
  // so there is no SharedArrayBuffer and cross-origin isolation is unnecessary. Adding those headers
  // would isolate the whole app and could break other same-origin assets, for no benefit here.
};

module.exports = nextConfig;
