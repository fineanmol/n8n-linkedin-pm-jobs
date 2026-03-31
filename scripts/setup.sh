#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# n8n LinkedIn PM Jobs — One-command setup
# Works on: Ubuntu 20.04/22.04, Oracle Cloud Free VM, Debian, any Linux server
# Usage:  bash scripts/setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()   { echo -e "${RED}[ERR]${NC}  $*" >&2; exit 1; }

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  n8n LinkedIn PM Job Automation — Server Setup${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── 1. Docker ─────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  info "Installing Docker..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get update -q
    sudo apt-get install -y -q docker.io curl
  elif command -v yum &>/dev/null; then
    sudo yum install -y docker curl
  else
    die "Unsupported package manager. Install Docker manually: https://docs.docker.com/engine/install/"
  fi
  sudo systemctl enable --now docker
  sudo usermod -aG docker "$USER"
  ok "Docker installed"
else
  ok "Docker already installed: $(docker --version)"
fi

# ── 2. Docker Compose (no sudo needed — installs as CLI plugin) ───────────────
if ! docker compose version &>/dev/null 2>&1; then
  info "Installing Docker Compose plugin..."
  COMPOSE_DIR="${DOCKER_CONFIG:-$HOME/.docker}/cli-plugins"
  mkdir -p "$COMPOSE_DIR"
  ARCH=$(uname -m)
  [[ "$ARCH" == "aarch64" ]] && ARCH="aarch64" || ARCH="x86_64"
  curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${ARCH}" \
       -o "$COMPOSE_DIR/docker-compose"
  chmod +x "$COMPOSE_DIR/docker-compose"
  ok "Docker Compose installed: $(docker compose version)"
else
  ok "Docker Compose already installed: $(docker compose version)"
fi

# ── 3. .env file ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

if [[ ! -f .env ]]; then
  cp .env.example .env
  # Generate a random password
  RAND_PASS=$(head -c 16 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 16)
  sed -i "s/changeme/$RAND_PASS/" .env
  ok ".env created with random password: ${YELLOW}${RAND_PASS}${NC}"
  echo -e "   ${YELLOW}⚠️  Save this password — you need it to log into n8n!${NC}"
else
  ok ".env already exists"
fi

# ── 4. Start the stack ────────────────────────────────────────────────────────
info "Building and starting containers (this takes ~2 min first time)..."
docker compose up -d --build

info "Waiting for n8n to be ready..."
N8N_PORT=$(grep N8N_PORT .env 2>/dev/null | cut -d= -f2 || echo 5678)
N8N_USER=$(grep N8N_BASIC_AUTH_USER .env 2>/dev/null | cut -d= -f2 || echo admin)
N8N_PASS=$(grep N8N_BASIC_AUTH_PASSWORD .env 2>/dev/null | cut -d= -f2 || echo changeme)

for i in $(seq 1 30); do
  if curl -sf -u "$N8N_USER:$N8N_PASS" "http://localhost:${N8N_PORT}/healthz" &>/dev/null; then
    ok "n8n is ready!"
    break
  fi
  echo -n "."
  sleep 3
done
echo ""

# ── 5. Import the workflow ─────────────────────────────────────────────────────
info "Importing workflow..."
RESPONSE=$(curl -sf -X POST "http://localhost:${N8N_PORT}/rest/workflows" \
  -u "$N8N_USER:$N8N_PASS" \
  -H "Content-Type: application/json" \
  -d @workflow.json 2>/dev/null || echo "{}")

WF_NAME=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',d).get('name','unknown'))" 2>/dev/null || echo "unknown")
WF_ID=$(echo "$RESPONSE"   | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',d).get('id','unknown'))" 2>/dev/null || echo "unknown")

if [[ "$WF_ID" != "unknown" && "$WF_ID" != "" ]]; then
  ok "Workflow imported: \"$WF_NAME\" (id=$WF_ID)"
else
  warn "Could not auto-import workflow. Import manually via n8n UI → Workflows → Import from file → workflow.json"
fi

# ── 6. Get server IP ──────────────────────────────────────────────────────────
PUBLIC_IP=$(curl -sf https://ifconfig.me 2>/dev/null || curl -sf https://api.ipify.org 2>/dev/null || echo "your-server-ip")

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✅  Setup complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  🌐 n8n URL   : ${YELLOW}http://${PUBLIC_IP}:${N8N_PORT}${NC}"
echo -e "  👤 Username  : ${YELLOW}${N8N_USER}${NC}"
echo -e "  🔑 Password  : ${YELLOW}${N8N_PASS}${NC}"
echo ""
echo -e "  ${BLUE}Next steps:${NC}"
echo -e "  1. Open the URL above in your browser"
echo -e "  2. Go to Settings → Credentials → add Google Sheets, Gmail, Google Docs"
echo -e "  3. Open the ⚙️ Config node → fill in spreadsheetId, yourEmail, etc."
echo -e "  4. Toggle the workflow ${GREEN}Active${NC} (top-right switch)"
echo ""
echo -e "  ${YELLOW}⚠️  Oracle Cloud: open port ${N8N_PORT} in your VCN Security List${NC}"
echo -e "     Console → Networking → Virtual Cloud Networks → Security Lists → Add Ingress Rule"
echo -e "     Source: 0.0.0.0/0  Protocol: TCP  Port: ${N8N_PORT}"
echo ""
