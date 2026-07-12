#!/usr/bin/env bash
#
# Build the client-side Asciidoctor-PDF WebAssembly engine.
#
# Compiles CRuby (wasm32-wasip1) together with the pinned gem closure from ./Gemfile.lock into a
# single self-contained `asciidoctor-pdf.wasm`, with the Ruby stdlib and all gems baked into an
# in-image virtual filesystem under /usr via wasi-vfs. The emitted binary is the verbatim, re-syncable
# artifact the web app vendors and serves same-origin — never hand-edit the `.wasm`.
#
# Sandbox invariant: the engine runs inside WASI with no subprocess, no socket, and no native
# extension loading. This script FAILS CLOSED if any compiled native extension enters the gem
# closure — a native `.so`/`.bundle`/`.dylib` in the packed tree, or a gem carrying an `extconf.rb`
# build recipe, aborts the build rather than shipping something that cannot load in the sandbox.
#
# Reproducibility: a fixed SOURCE_DATE_EPOCH and pinned tool/ruby versions keep the output stable for
# identical inputs. Bump the pins deliberately and re-run; do not edit the artifact.
#
# Prerequisites: a POSIX shell with the ruby.wasm toolchain available — either the `ruby_wasm`
# builder gem (providing the `rbwasm` CLI) plus `wasi-vfs`, or the equivalent ruby.wasm builder
# container image. Override the pins and paths below via the environment if needed.

set -euo pipefail

# ── Pins (bump deliberately; keep in lockstep with the JS-side @ruby/wasm-wasi version) ──────────
: "${RUBY_WASM_VERSION:=2.8.1}"            # ruby.wasm / ruby_wasm builder release
# rbwasm expects a major.minor Ruby source (e.g. 3.3), not a patch version. Use a dedicated variable
# name — NOT the plain RUBY_VERSION, which the base CRuby image exports as a full patch version
# (e.g. 3.3.11) that rbwasm rejects.
: "${RBWASM_RUBY_VERSION:=3.3}"            # CRuby major.minor compiled to wasm32-wasip1
# rbwasm expects the canonical target triplet (wasm32-unknown-wasip1); the short wasm32-wasip1 form
# is rejected by its toolchain selector.
: "${WASI_TARGET:=wasm32-unknown-wasip1}"
: "${SOURCE_DATE_EPOCH:=1700000000}"       # fixed epoch → deterministic timestamps in the artifact
export SOURCE_DATE_EPOCH

# ── Paths ────────────────────────────────────────────────────────────────────────────────────────
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUBY_DIR="$HERE"
# Bundler vendors the pinned gem closure here; rbwasm's own CRuby/wasi-sdk build cache lives under
# ./build and ./rubies (both relative to RUBY_DIR — override via BUNDLE_PATH / the Docker cache mount).
GEM_VENDOR_DIR="${GEM_VENDOR_DIR:-$RUBY_DIR/.wasm-build/vendor/bundle}"
OUTPUT_WASM="${OUTPUT_WASM:-$RUBY_DIR/asciidoctor-pdf.wasm}"

echo "==> Building Asciidoctor-PDF wasm engine"
echo "    ruby.wasm      : $RUBY_WASM_VERSION (CRuby $RBWASM_RUBY_VERSION, target $WASI_TARGET)"
echo "    lockfile       : $RUBY_DIR/Gemfile.lock"
echo "    output         : $OUTPUT_WASM"
echo "    SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH"

# The ruby.wasm builder gem (`ruby_wasm`) provides the `rbwasm` CLI and carries its own bundled
# wasi-vfs; `bundle` vendors the pinned gem closure. An external `wasi-vfs` binary is not required —
# rbwasm links wasi-vfs into the engine and bakes the stdlib + gems itself.
for tool in rbwasm bundle; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERROR: required tool '$tool' not found on PATH." >&2
    echo "       Run this inside the ruby.wasm builder toolchain (the ruby_wasm gem provides rbwasm)." >&2
    echo "       Use ./build-wasm.docker.sh to run it inside the pinned toolchain container." >&2
    exit 1
  fi
done

# ── 1. Vendor the pinned gem closure (frozen lockfile, pure-Ruby platform) ────────────────────────
# Install from the committed lockfile only (no dependency drift). force_ruby_platform keeps every gem
# on its pure-Ruby variant. The wasm target has no host compiler, so a gem needing a native extension
# surfaces at the gate below (step 2) — or, if it hard-requires a system library, fails the rbwasm
# compile (step 3).
echo "==> Vendoring pinned gems (frozen lockfile)"
export BUNDLE_GEMFILE="$RUBY_DIR/Gemfile"
bundle config set --local frozen true
bundle config set --local force_ruby_platform true
bundle config set --local path "$GEM_VENDOR_DIR"
bundle install

# ── 2. Fail closed on any native extension in the closure (except the sanctioned JS host bridge) ──
# Nothing host-compiled may enter the sandbox. Reject prebuilt shared objects and any gem shipping a
# native build recipe. The sole allowed exception is the `js` gem: it is the ruby.wasm host bridge,
# and its C extension is compiled to wasm and statically linked into the engine by rbwasm (step 3) —
# it never loads a host `.so`. This is the hard sandbox gate; its failure must abort the whole build.
echo "==> Verifying the gem closure is free of native extensions (js host bridge excepted)"
native_hits="$(find "$GEM_VENDOR_DIR" \
  \( -name '*.so' -o -name '*.bundle' -o -name '*.dylib' -o -name 'extconf.rb' \) \
  -print 2>/dev/null | grep -v '/gems/js-[^/]*/' || true)"
if [ -n "$native_hits" ]; then
  echo "ERROR: native extension(s) entered the gem closure — cannot run in the WASI sandbox:" >&2
  echo "$native_hits" | sed 's/^/       /' >&2
  echo "       Remove or replace the offending gem in Gemfile/Gemfile.lock (prefer a pure-Ruby" >&2
  echo "       path), or gate the optional capability that pulls it in, then rebuild." >&2
  exit 2
fi
echo "    OK — no host-loaded native extensions found."

# ── 3. Compile CRuby + bake stdlib and the gem closure into the final artifact ────────────────────
# rbwasm compiles CRuby (and the js host-bridge extension) to $WASI_TARGET, then bakes the full stdlib
# and the vendored gem closure into the engine's in-image virtual filesystem via its built-in
# wasi-vfs. It discovers the gem set from the Bundler definition of $BUNDLE_GEMFILE; `-rbundler` makes
# that definition visible without `bundle exec` (rbwasm/ruby_wasm are intentionally not in the closure
# and are auto-excluded from the bake). The first run downloads the wasi-sdk and builds CRuby, which
# is slow; ./build and ./rubies cache it for subsequent runs.
echo "==> Compiling CRuby + baking stdlib and gems into the wasm engine (first run is slow)"
RUBYOPT="${RUBYOPT:-} -rbundler" \
rbwasm build \
  --ruby-version "$RBWASM_RUBY_VERSION" \
  --target "$WASI_TARGET" \
  -o "$OUTPUT_WASM"

echo "==> Done: $OUTPUT_WASM"
ls -l "$OUTPUT_WASM"
