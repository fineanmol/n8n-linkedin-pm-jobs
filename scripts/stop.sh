#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# stop.sh — Stop the LinkedIn Job Automation stack (n8n + LinkedIn Proxy)
# Usage:  bash scripts/stop.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "🛑 Stopping services..."
docker compose down 2>&1 | grep -E "Container|Network|Stopping|Stopped|Removing|Removed" || true

echo ""
echo "✅ All services stopped."
echo "   Run  bash scripts/start.sh  to start again."
