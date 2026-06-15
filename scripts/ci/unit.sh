#!/usr/bin/env bash
# Job 2 — Unit tests with coverage. No external services required.
set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RESET='\033[0m'
step() { echo -e "${CYAN}[ci-unit]${RESET} $*"; }
ok()   { echo -e "${GREEN}[ci-unit]${RESET} $*"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

step "Building packages (generates Prisma client + declaration files) …"
pnpm -r build

step "Shared unit tests …"
pnpm --filter @asciidocollab/shared test

step "Domain unit tests with coverage …"
(cd packages/domain && npx jest --coverage --coverageReporters=text lcov)

step "API unit tests …"
pnpm --filter @asciidocollab/api test

step "Collaboration server unit tests …"
pnpm --filter @asciidocollab/collab test

step "Web unit tests with coverage …"
pnpm --filter @asciidocollab/web test:ci

ok "All unit tests passed."
