#!/usr/bin/env bash
#
# Run the client-side Asciidoctor-PDF wasm build inside the pinned ruby.wasm toolchain container.
#
# This environment has Docker but no host ruby/rbwasm/wasi-vfs, so the real engine build must run in a
# container that carries the toolchain (see ./Dockerfile). This wrapper builds that image, then runs
# build-wasm.sh inside it with this ruby/ directory mounted, so the emitted asciidoctor-pdf.wasm lands
# back on the host next to its Gemfile.
#
# The heavy, cacheable parts of the build — the wasi-sdk download and the CRuby-to-wasm compile — are
# kept in named Docker volumes (build cache, rubies cache, vendored gems) so re-runs are fast and the
# host ruby/ directory stays clean (no build/ or rubies/ scratch trees on the host).
#
# Usage:  ./build-wasm.docker.sh          # build image (if needed) + build the engine
#         REBUILD_IMAGE=1 ./build-wasm.docker.sh   # force-rebuild the toolchain image first
#
# No arguments. Override pins via the Dockerfile ARGs / build-wasm.sh env if needed.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE="asciidoc-pdf-wasm-builder:latest"

echo "==> Building toolchain image ($IMAGE)"
if [ "${REBUILD_IMAGE:-0}" = "1" ]; then
  docker build --no-cache -t "$IMAGE" "$HERE"
else
  docker build -t "$IMAGE" "$HERE"
fi

# Named caches so the expensive wasi-sdk fetch + CRuby compile survive across runs.
docker volume create asciidoc_pdf_wasm_build   >/dev/null
docker volume create asciidoc_pdf_wasm_rubies  >/dev/null
docker volume create asciidoc_pdf_wasm_gems    >/dev/null

echo "==> Running build-wasm.sh inside the container"
# Mount the host ruby/ dir at /work; keep rbwasm's scratch (./build, ./rubies) and the vendored gem
# tree in named volumes so they never touch the host checkout.
exec docker run --rm \
  -v "$HERE":/work \
  -v asciidoc_pdf_wasm_build:/work/build \
  -v asciidoc_pdf_wasm_rubies:/work/rubies \
  -v asciidoc_pdf_wasm_gems:/work/.wasm-build/vendor/bundle \
  -w /work \
  "$IMAGE" \
  bash ./build-wasm.sh
