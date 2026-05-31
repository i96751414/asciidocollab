#!/usr/bin/env bash
set -euo pipefail

# ─── Colours ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[dev]${RESET} $*"; }
success() { echo -e "${GREEN}[dev]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[dev]${RESET} $*"; }
die()     { echo -e "${RED}[dev]${RESET} $*" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ─── Prerequisites ────────────────────────────────────────────────────────────
check_cmd() { command -v "$1" &>/dev/null || die "Required command not found: $1. See README for install instructions."; }
check_cmd node
check_cmd pnpm
check_cmd docker

node -e "process.exit(parseInt(process.versions.node) < 24 ? 1 : 0)" 2>/dev/null \
  || die "Node.js 24+ is required. Found: $(node --version)"

# ─── Env file ─────────────────────────────────────────────────────────────────
ENV_FILE="$ROOT/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  info "Creating .env.local from .env.example …"
  cp "$ROOT/.env.example" "$ENV_FILE"

  # Auto-generate secrets so the app starts without manual intervention
  SESSION_SECRET=$(openssl rand -base64 32)
  ENCRYPTION_KEY=$(openssl rand -base64 32)

  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|ASCIIDOCOLLAB_AUTH_SESSION_SECRET=CHANGE_ME|ASCIIDOCOLLAB_AUTH_SESSION_SECRET=${SESSION_SECRET}|" "$ENV_FILE"
    sed -i '' "s|ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY=CHANGE_ME|ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY=${ENCRYPTION_KEY}|" "$ENV_FILE"
  else
    sed -i "s|ASCIIDOCOLLAB_AUTH_SESSION_SECRET=CHANGE_ME|ASCIIDOCOLLAB_AUTH_SESSION_SECRET=${SESSION_SECRET}|" "$ENV_FILE"
    sed -i "s|ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY=CHANGE_ME|ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY=${ENCRYPTION_KEY}|" "$ENV_FILE"
  fi

  success ".env.local created with auto-generated secrets."
else
  info "Using existing .env.local"
fi

# Source env file
set -a; source "$ENV_FILE"; set +a

# ─── Docker services ──────────────────────────────────────────────────────────
# --wait blocks until all services with healthchecks report healthy.
# For postgres this means the DB and the asciidocollab database both exist,
# because the official postgres image only accepts connections after its
# POSTGRES_DB initialisation script has run.
info "Starting infrastructure services (PostgreSQL + Mailpit) …"
docker compose -f "$ROOT/docker-compose.yml" up -d --wait
success "PostgreSQL is ready."

# ─── Dependencies ─────────────────────────────────────────────────────────────
info "Installing dependencies …"
pnpm install --frozen-lockfile

# ─── Build ────────────────────────────────────────────────────────────────────
info "Building packages …"
pnpm build

# ─── Database schema ──────────────────────────────────────────────────────────
# ASCIIDOCOLLAB_DATABASE_URL is already exported from the sourced env file.
# prisma.config.ts reads it and passes it as the datasource URL.
info "Applying database schema …"
(cd "$ROOT/packages/db" && pnpm exec prisma db push)
success "Database schema applied."

# ─── Process cleanup on exit ──────────────────────────────────────────────────
API_PID=""
WEB_PID=""

cleanup() {
  echo ""
  info "Shutting down …"
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "$WEB_PID" ]] && kill "$WEB_PID" 2>/dev/null || true
  info "Stopped. Docker services are still running — stop them with: docker compose down"
}
trap cleanup EXIT INT TERM

# ─── Start services ───────────────────────────────────────────────────────────
info "Starting API server …"
(cd "$ROOT/apps/api" && NODE_ENV=development node dist/index.js) &
API_PID=$!

info "Starting web app …"
(cd "$ROOT/apps/web" && pnpm dev) &
WEB_PID=$!

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  ${GREEN}AsciiDoCollab is running${RESET}"
echo ""
echo -e "  Web app   →  ${CYAN}http://localhost:3000${RESET}"
echo -e "  API       →  ${CYAN}http://localhost:4000${RESET}"
echo -e "  API docs  →  ${CYAN}http://localhost:4000/documentation${RESET}"
echo -e "  Email UI  →  ${CYAN}http://localhost:8025${RESET}  (captured emails)"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  Press ${YELLOW}Ctrl+C${RESET} to stop the app servers."
echo -e "  Run ${YELLOW}docker compose down${RESET} to also stop the database."
echo ""

wait "$API_PID" "$WEB_PID"
