# Toolchain image for building the client-side Asciidoctor-PDF WebAssembly engine.
#
# Carries the ruby.wasm builder (`ruby_wasm` gem → the `rbwasm` CLI, which also bundles wasi-vfs) plus
# a standalone `wasi-vfs` CLI, on top of a full CRuby image that has the host build tools rbwasm needs
# to compile CRuby to wasm32-wasip1. Build the image once, then run ./build-wasm.docker.sh, which
# mounts this ruby/ directory and executes build-wasm.sh inside the container.
#
# Pins are kept in lockstep with build-wasm.sh (RUBY_WASM_VERSION) and the JS-side @ruby/wasm-wasi.

FROM ruby:3.3

# ── Pins (keep in lockstep with build-wasm.sh) ────────────────────────────────────────────────────
ARG RUBY_WASM_VERSION=2.8.1
# wasi-vfs CLI version matching the wasi-vfs that ruby_wasm links into the engine.
ARG WASI_VFS_VERSION=0.5.3

# rbwasm compiles CRuby from source for the wasm target; it needs a host C toolchain, autotools and
# the usual build helpers. curl/git/xz are used to fetch the wasi-sdk and wasi-vfs.
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential autoconf bison ruby-dev libyaml-dev \
      curl git xz-utils ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# The ruby.wasm builder gem — provides the `rbwasm` CLI (and its own bundled wasi-vfs).
RUN gem install ruby_wasm -v "${RUBY_WASM_VERSION}" --no-document

# Remove the base image's host CRuby C headers. rbwasm cross-compiles CRuby with the default prefix
# /usr/local, so when it builds a gem's native extension for wasm (here: the `js` host bridge) mkmf
# expects the target Ruby headers under /usr/local/include/ruby-<abi>. The base image already occupies
# that exact path with its own x86_64 headers, which shadow the wasm headers and make the js ext
# compile pick up the host ruby.h and then fail to find the wasm ruby/config.h. Deleting the host
# headers forces mkmf onto the correct source + build-tree (extout) wasm header paths. Nothing here
# builds a host C extension (bundler installs a pure-Ruby closure; rbwasm needs no host Ruby headers),
# so removing them is safe.
RUN rm -rf /usr/local/include/ruby-*

# Standalone wasi-vfs CLI on PATH — a convenience/parity tool only. rbwasm bakes the stdlib + gems
# with its own bundled wasi-vfs, and build-wasm.sh does not require this binary, so the fetch is
# best-effort and never fails the image build.
RUN set -eu; \
    ( curl -fsSL -o /tmp/wasi-vfs.zip \
        "https://github.com/kateinoigakukun/wasi-vfs/releases/download/v${WASI_VFS_VERSION}/wasi-vfs-cli-x86_64-unknown-linux-gnu.zip" \
      && apt-get update && apt-get install -y --no-install-recommends unzip \
      && unzip -o /tmp/wasi-vfs.zip -d /tmp \
      && install -m 0755 /tmp/wasi-vfs /usr/local/bin/wasi-vfs \
      && rm -rf /var/lib/apt/lists/* /tmp/wasi-vfs.zip \
      && wasi-vfs --version ) \
    || echo "NOTE: standalone wasi-vfs CLI not installed (optional); rbwasm carries its own."

WORKDIR /work
