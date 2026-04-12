#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# start.sh — Start the LinkedIn Job Automation stack (n8n + LinkedIn Proxy)
# Usage:  bash scripts/start.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
N8N_URL="http://localhost:5678"
TIMEOUT=60   # seconds to wait for n8n to become ready

cd "$PROJECT_DIR"

# ── 1. Start Docker Desktop (macOS only) ─────────────────────────────────────
if ! docker info &>/dev/null; then
  echo "🐳 Docker not running — launching Docker Desktop..."
  open -a Docker 2>/dev/null || true

  echo -n "   Waiting for Docker"
  elapsed=0
  until docker info &>/dev/null; do
    echo -n "."
    sleep 2
    elapsed=$((elapsed + 2))
    if [[ $elapsed -ge 60 ]]; then
      echo ""
      echo "❌ Docker didn't start after 60s. Please open Docker Desktop manually."
      exit 1
    fi
  done
  echo " ✅"
fi

# ── 2. Start containers via docker compose ───────────────────────────────────
echo ""
echo "🚀 Starting services..."
docker compose up -d --build 2>&1 | grep -E "^( Container| Network| Volume|Error)" || true

# ── 3. Wait for n8n to be ready ──────────────────────────────────────────────
echo ""
echo -n "⏳ Waiting for n8n to be ready"
elapsed=0
until curl -sf "$N8N_URL/healthz" &>/dev/null; do
  echo -n "."
  sleep 2
  elapsed=$((elapsed + 2))
  if [[ $elapsed -ge $TIMEOUT ]]; then
    echo ""
    echo "❌ n8n didn't respond after ${TIMEOUT}s. Check: docker compose logs n8n"
    exit 1
  fi
done
echo " ✅"

# ── 4. Show status ───────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ All services running!"
echo ""
echo "  n8n UI  →  $N8N_URL"
echo "  Email   →  agarwal.anmol2004@gmail.com"
echo "  Password→  changeme  (change in Settings)"
echo ""
echo "  Containers:"
docker ps --format "    {{.Names}}  {{.Status}}" | grep -E "n8n|linkedin"
echo "═══════════════════════════════════════════"
echo ""
echo "  📋 To view logs:     docker compose logs -f"
echo "  🛑 To stop:          docker compose down"
echo "  🔄 To restart n8n:   docker compose restart n8n"
