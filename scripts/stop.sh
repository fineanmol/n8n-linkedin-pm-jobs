#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# stop.sh — Fully stop and remove the n8n + LinkedIn Proxy stack
# Usage:  bash scripts/stop.sh
#
# Stops all containers, removes them and the compose network so nothing keeps
# running in the background. Your workflow data stays in ~/.n8n (bind mount).
# Start again with:  bash scripts/start.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "🛑 Shutting down all services (full teardown)..."

if ! docker info &>/dev/null 2>&1; then
  echo "✅ Docker is not running — nothing to stop."
  exit 0
fi

# Stop containers, remove containers + network (data in ~/.n8n is preserved)
docker compose down --remove-orphans 2>&1 | grep -E "Container|Network|Stopping|Stopped|Removing|Removed" || true

echo ""
echo "🔍 Verifying nothing is still running..."
left=$(docker ps --filter "name=n8n" --filter "name=linkedin-proxy" --format "{{.Names}}" 2>/dev/null || true)
if [[ -n "$left" ]]; then
  echo "⚠️  Still running: $left"
  echo "   Force stopping..."
  docker stop $left 2>/dev/null || true
  docker rm $left 2>/dev/null || true
else
  echo "   No n8n / linkedin-proxy containers running."
fi

echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ Stack fully stopped — no background jobs"
echo ""
echo "  Workflow data saved in:  ~/.n8n"
echo "  Start again:             bash scripts/start.sh"
echo ""
echo "  Optional — quit Docker Desktop entirely"
echo "  (frees more RAM/CPU when not automating):"
echo "    Docker menu → Quit Docker Desktop"
echo "═══════════════════════════════════════════"
