#!/usr/bin/env bash
# Local end-to-end tests against a fully ISOLATED stack.
#
# Unlike scripts/ci-e2e.sh — which targets the shared dev compose and runs a
# destructive `prisma db push --force-reset` on it — this script spins up a
# SEPARATE Postgres + Mailpit (docker-compose.e2e.yml, distinct ports and
# Compose project) and runs the API and web on distinct ports against a
# throwaway database. It never touches your development containers or data.
#
# Because the database is fresh and empty every run, only a plain `prisma db
# push` is needed (no `--force-reset`).
#
# Usage:  scripts/e2e-local.sh          (or: pnpm e2e:local)
# Override a clashing port:  E2E_WEB_PORT=3200 scripts/e2e-local.sh
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; RESET='\033[0m'
step() { echo -e "${CYAN}[e2e-local]${RESET} $*"; }
ok()   { echo -e "${GREEN}[e2e-local]${RESET} $*"; }
die()  { echo -e "${RED}[e2e-local]${RESET} $*" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Restore the terminal on exit in case a child left it in a raw/TUI mode, and
# stop spawned server process trees cleanly (no orphaned next-server, etc.).
source "$ROOT/scripts/lib/term.sh"
source "$ROOT/scripts/lib/proc.sh"
term_save

command -v docker &>/dev/null || die "Docker is required."

# ─── Isolated configuration (override via env if a port clashes) ─────────────
COMPOSE="docker compose -f $ROOT/docker-compose.e2e.yml"
PG_PORT="${E2E_PG_PORT:-5433}"
SMTP_PORT="${E2E_SMTP_PORT:-1126}"
MAILPIT_UI_PORT="${E2E_MAILPIT_UI_PORT:-8126}"
API_PORT="${E2E_API_PORT:-4100}"
WEB_PORT="${E2E_WEB_PORT:-3100}"

# Isolate from a running dev stack (scripts/dev.sh): the API also binds an
# internal collab port (default 4001, already held by the dev API), so offset it.
# The Next `.next` build dir is intentionally shared with dev — only containers
# and ports are isolated.
export ASCIIDOCOLLAB_COLLAB_INTERNAL_PORT="${E2E_COLLAB_INTERNAL_PORT:-4101}"

export ASCIIDOCOLLAB_DATABASE_URL="postgresql://asciidocollab:asciidocollab@localhost:${PG_PORT}/asciidocollab_e2e"
export ASCIIDOCOLLAB_API_PORT="$API_PORT"
export ASCIIDOCOLLAB_API_HOST="0.0.0.0"
export ASCIIDOCOLLAB_API_FRONTEND_URL="http://localhost:${WEB_PORT}"
export ASCIIDOCOLLAB_API_CORS_ORIGINS="http://localhost:${WEB_PORT}"
# Test-only secrets — never used outside e2e. Encryption key is base64 of a 32-byte string.
export ASCIIDOCOLLAB_AUTH_SESSION_SECRET="e2e-local-session-secret-not-for-production"
export ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY="Y2ktdGVzdC1lbmNyeXB0aW9uLWtleS0zMmJ5dGVzISE="
export ASCIIDOCOLLAB_AUTH_COOKIE_SECURE="false"
export ASCIIDOCOLLAB_AUTH_EMAIL_PROVIDER="smtp"
export ASCIIDOCOLLAB_AUTH_EMAIL_ENABLED="true"
export ASCIIDOCOLLAB_AUTH_EMAIL_FROM="noreply@asciidocollab.local"
export ASCIIDOCOLLAB_AUTH_SMTP_HOST="localhost"
export ASCIIDOCOLLAB_AUTH_SMTP_PORT="$SMTP_PORT"
# Raise rate limits — parallel Playwright workers all share one localhost IP.
export ASCIIDOCOLLAB_ADMIN_INVITE_RATE_LIMIT_MAX=500
export ASCIIDOCOLLAB_ADMIN_OPEN_REGISTRATION_RATE_LIMIT_MAX=10000
export ASCIIDOCOLLAB_AUTH_EMAIL_VERIFICATION_RATE_LIMIT_MAX=500
export ASCIIDOCOLLAB_AUTH_INVITATION_RATE_LIMIT_MAX=500

# ─── Cleanup on exit ─────────────────────────────────────────────────────────
API_PID=""; WEB_PID=""
cleanup() {
  echo ""
  step "Tearing down isolated stack …"
  # Stop servers (and their children) while the DB is still up so the API can
  # shut down gracefully, then tear the containers down.
  stop_tree "$API_PID"
  stop_tree "$WEB_PID"
  $COMPOSE down -v --remove-orphans 2>/dev/null || true
  term_restore
}
trap cleanup EXIT INT TERM

# ─── Fresh infrastructure ────────────────────────────────────────────────────
step "Starting isolated PostgreSQL + Mailpit (host ports ${PG_PORT} / ${SMTP_PORT} / ${MAILPIT_UI_PORT}) …"
$COMPOSE down -v --remove-orphans 2>/dev/null || true
$COMPOSE up -d --wait
ok "Infrastructure ready."

# ─── Build backend ───────────────────────────────────────────────────────────
step "Building backend packages …"
pnpm --filter '!@asciidocollab/web' -r build

step "Creating schema on the throwaway database (plain db push) …"
pnpm --filter @asciidocollab/db exec prisma db push

# ─── API ─────────────────────────────────────────────────────────────────────
step "Starting API on :${API_PORT} …"
node "$ROOT/apps/api/dist/index.js" &
API_PID=$!
step "Waiting for API …"
until curl -sf "http://localhost:${API_PORT}/health" &>/dev/null; do sleep 1; done
ok "API is ready."

# ─── Web ─────────────────────────────────────────────────────────────────────
step "Building Next.js (API → :${API_PORT}) …"
NEXT_PUBLIC_API_URL="http://localhost:${API_PORT}" pnpm --filter @asciidocollab/web build

step "Starting Next.js on :${WEB_PORT} …"
NEXT_PUBLIC_API_URL="http://localhost:${API_PORT}" PORT="$WEB_PORT" pnpm --filter @asciidocollab/web start &
WEB_PID=$!
step "Waiting for web …"
until curl -sf "http://localhost:${WEB_PORT}" &>/dev/null; do sleep 1; done
ok "Web is ready."

# ─── E2E suite ───────────────────────────────────────────────────────────────
step "Running Playwright E2E tests …"
NEXT_PUBLIC_API_URL="http://localhost:${API_PORT}" \
NEXT_PUBLIC_WEB_URL="http://localhost:${WEB_PORT}" \
MAILPIT_URL="http://localhost:${MAILPIT_UI_PORT}" \
  pnpm --filter @asciidocollab/web e2e

ok "E2E suite passed — isolated stack, dev data untouched."
