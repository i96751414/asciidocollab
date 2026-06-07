#!/usr/bin/env bash
# Job 3 — Infrastructure integration tests. Testcontainers manages its own PostgreSQL
# container; no external database required.
set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RESET='\033[0m'
step() { echo -e "${CYAN}[ci-integration]${RESET} $*"; }
ok()   { echo -e "${GREEN}[ci-integration]${RESET} $*"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step "Building packages …"
pnpm -r build

step "Infrastructure integration tests …"
# passWithNoTests is set in jest.config.cjs — no extra flag needed.
TESTCONTAINERS_RYUK_DISABLED=true pnpm --filter @asciidocollab/infrastructure test

ok "All integration tests passed."
