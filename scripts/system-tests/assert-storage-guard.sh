#!/usr/bin/env bash
# Regression guard for the collaboration storage-consistency check (the data-loss bug
# scripts/dev.sh had: the API and collab server using different storage roots silently
# diverged and overwrote each other's edits — see apps/collab/src/storage-probe.ts).
#
# Assumes the REST API is ALREADY running and reachable on its internal collab port
# (default 127.0.0.1:4001) with some storage root. This starts the collaboration server
# with a DIFFERENT storage root and asserts it REFUSES to start (exits non-zero) rather
# than running with divergent storage.
#
# Usage: scripts/system-tests/assert-storage-guard.sh
#   Env (optional): ASCIIDOCOLLAB_COLLAB_API_INTERNAL_URL (default http://127.0.0.1:4001),
#                   ASCIIDOCOLLAB_DATABASE_URL, ASCIIDOCOLLAB_COLLAB_PORT (default 4399).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; RESET='\033[0m'
step() { echo -e "${CYAN}[storage-guard]${RESET} $*"; }
ok()   { echo -e "${GREEN}[storage-guard]${RESET} $*"; }
die()  { echo -e "${RED}[storage-guard]${RESET} $*" >&2; exit 1; }

DIVERGENT_STORAGE="$(mktemp -d)"
LOG="$(mktemp)"
trap 'rm -rf "$DIVERGENT_STORAGE" "$LOG"' EXIT

step "Starting collab with a DIVERGENT storage root ($DIVERGENT_STORAGE) — it must refuse to start."
set +e
env \
  ASCIIDOCOLLAB_STORAGE_PATH="$DIVERGENT_STORAGE" \
  ASCIIDOCOLLAB_COLLAB_PORT="${ASCIIDOCOLLAB_COLLAB_PORT:-4399}" \
  node "$ROOT/apps/collab/dist/index.js" > "$LOG" 2>&1 &
COLLAB_PID=$!

# Give it up to ~15s to either exit (correct) or start listening (a regression).
exit_code=""
for _ in $(seq 1 30); do
  if ! kill -0 "$COLLAB_PID" 2>/dev/null; then
    wait "$COLLAB_PID"; exit_code=$?
    break
  fi
  sleep 0.5
done
set -e

if [[ -z "$exit_code" ]]; then
  kill "$COLLAB_PID" 2>/dev/null || true
  echo "--- collab log ---"; cat "$LOG"
  die "REGRESSION: collab server did NOT exit with divergent storage — it would run and corrupt data."
fi

if [[ "$exit_code" -eq 0 ]]; then
  echo "--- collab log ---"; cat "$LOG"
  die "REGRESSION: collab server exited 0 with divergent storage (expected a non-zero fail-fast)."
fi

if ! grep -q "do NOT share the same file-storage root" "$LOG"; then
  echo "--- collab log ---"; cat "$LOG"
  die "collab server exited non-zero but without the expected storage-mismatch error."
fi

ok "Collab server correctly refused to start with divergent storage (exit $exit_code)."
