#!/usr/bin/env bash
# Job 1 — Quality gate: build, lint, type-check, architecture guard, security audit.
set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RESET='\033[0m'
step() { echo -e "${CYAN}[ci-quality]${RESET} $*"; }
ok()   { echo -e "${GREEN}[ci-quality]${RESET} $*"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

step "Building packages (generates declaration files) …"
pnpm -r build

step "Linting …"
npx eslint .

step "Type-checking shared …"
npx tsc -p packages/shared/tsconfig.json --noEmit

step "Type-checking domain …"
npx tsc -p packages/domain/tsconfig.json --noEmit

step "Type-checking infrastructure …"
npx tsc -p packages/infrastructure/tsconfig.json --noEmit

step "Type-checking API …"
npx tsc -p apps/api/tsconfig.json --noEmit

step "Type-checking web …"
npx tsc -p apps/web/tsconfig.json --noEmit

step "Architecture guard (fresh-onion) …"
npx fresh-onion

step "Security audit (high+ severity) …"
pnpm audit --audit-level=high

ok "All quality checks passed."
