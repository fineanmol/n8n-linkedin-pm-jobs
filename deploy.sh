#!/usr/bin/env bash
# =============================================================================
#  deploy.sh — Deploy n8n Job Automation to Oracle Cloud E2.1.Micro (1GB RAM)
#
#  Uses Cloudflare Tunnel for HTTPS — no nginx, no open ports needed.
#
#  Usage: bash deploy.sh <subdomain> <cloudflare-tunnel-token>
#
#  Example:
#    bash deploy.sh n8n.yourdomain.com eyJhIjoiMWY...long-token...
#
#  BEFORE running this:
#    1. Push this project to the VM: scp -r . ubuntu@<VM_IP>:~/n8n-automation/
#    2. SSH into the VM: ssh ubuntu@<VM_IP>
#    3. Have your Cloudflare Tunnel token ready (see DEPLOY.md Step 3)
# =============================================================================
set -euo pipefail

SUBDOMAIN="${1:-}"
CF_TOKEN="${2:-}"

if [[ -z "$SUBDOMAIN" ]]; then
  echo "Usage: bash deploy.sh <subdomain> [cloudflare-tunnel-token]"
  echo "Example: bash deploy.sh n8n.yourdomain.com eyJhIjoiM..."
  exit 1
fi

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# Detect OS package manager
if command -v dnf &>/dev/null; then
  PKG="dnf"
elif command -v apt-get &>/dev/null; then
  PKG="apt-get"
else
  echo "Unsupported OS — neither dnf nor apt-get found"; exit 1
fi

echo ""
echo "=================================================="
echo "  n8n Job Automation — Oracle E2.1.Micro Deploy"
echo "  Subdomain : $SUBDOMAIN"
echo "  OS pkg mgr: $PKG"
echo "  RAM budget: ~500 MB + 4 GB swap"
echo "=================================================="
echo ""

# ── 1. System packages ────────────────────────────────────────────────────────
echo "[1/6] Installing system packages..."
if [[ "$PKG" == "dnf" ]]; then
  sudo dnf install -y -q curl wget openssl
else
  sudo apt-get update -qq
  sudo apt-get install -y -qq curl wget openssl
fi

# Docker
if ! command -v docker &>/dev/null; then
  echo "      Installing Docker..."
  curl -fsSL https://get.docker.com | sudo bash
  sudo usermod -aG docker "$USER"
  sudo systemctl enable --now docker
  # Apply group without re-login
  exec sg docker "$0 $*"
fi

if ! docker compose version &>/dev/null 2>&1; then
  if [[ "$PKG" == "dnf" ]]; then
    sudo dnf install -y docker-compose-plugin
  else
    sudo apt-get install -y docker-compose-plugin
  fi
fi

echo "      Docker ready."

# ── 2. Swap file (critical for ~500 MB RAM VM) ───────────────────────────────
echo ""
echo "[2/6] Setting up 4 GB swap file..."
if [[ ! -f /swapfile ]]; then
  sudo fallocate -l 4G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096 status=progress
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  # Tune swappiness for server workload
  echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
  sudo sysctl -p
  echo "      4 GB swap created."
else
  echo "      Swap already exists — skipping."
fi
free -h

# ── 3. Environment file ───────────────────────────────────────────────────────
echo ""
echo "[3/6] Setting up production environment..."

if [[ ! -f .env.prod ]]; then
  RAND_PASS=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 20)
  ENC_KEY=$(openssl rand -hex 32)
  cat > .env.prod <<EOF
# Production — DO NOT commit this file
N8N_HOST=${SUBDOMAIN}
N8N_PROTOCOL=https
WEBHOOK_URL=https://${SUBDOMAIN}/

N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=${RAND_PASS}

# IMPORTANT: save this key — losing it means losing all credentials
N8N_ENCRYPTION_KEY=${ENC_KEY}

GENERIC_TIMEZONE=Europe/Berlin
EOF
  echo "      Created .env.prod"
  echo ""
  echo "  ┌─────────────────────────────────────────────────┐"
  echo "  │  SAVE THESE CREDENTIALS:                        │"
  echo "  │  URL     : https://${SUBDOMAIN}                 │"
  echo "  │  User    : admin                                │"
  echo "  │  Password: ${RAND_PASS}                         │"
  echo "  └─────────────────────────────────────────────────┘"
  echo ""
else
  echo "      .env.prod already exists — skipping."
fi

# ── 4. Cloudflare Tunnel ──────────────────────────────────────────────────────
echo ""
echo "[4/6] Installing Cloudflare Tunnel (cloudflared)..."

if ! command -v cloudflared &>/dev/null; then
  # ARM64 binary
  ARCH=$(uname -m)
  if [[ "$ARCH" == "aarch64" ]]; then
    CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
  else
    CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
  fi
  wget -q "$CF_URL" -O /tmp/cloudflared
  sudo install /tmp/cloudflared /usr/local/bin/cloudflared
  echo "      cloudflared installed."
fi

# Install as a systemd service
if [[ -n "$CF_TOKEN" ]]; then
  sudo cloudflared service install "$CF_TOKEN" 2>/dev/null || true
  sudo systemctl enable cloudflared
  sudo systemctl start cloudflared
  echo "      Cloudflare Tunnel started."
else
  echo "      ⚠️  No Cloudflare token provided."
  echo "         Run manually after getting your token:"
  echo "         sudo cloudflared service install <TOKEN>"
  echo "         sudo systemctl start cloudflared"
fi

# ── 5. Start Docker services ──────────────────────────────────────────────────
echo ""
echo "[5/6] Starting n8n + LinkedIn proxy..."

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

sleep 15
echo "      Container status:"
docker compose -f docker-compose.prod.yml ps

echo ""
echo "      Memory usage:"
free -h

# ── 6. Auto-restart on reboot ─────────────────────────────────────────────────
echo ""
echo "[6/6] Enabling auto-start on reboot..."
sudo systemctl enable docker

# Crontab to restart containers if they go down
(crontab -l 2>/dev/null; echo "@reboot sleep 30 && cd $PROJECT_DIR && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d") | sort -u | crontab -

echo "      Auto-start configured."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "✅ Deployment complete!"
echo ""
echo "  n8n  →  https://${SUBDOMAIN}"
echo "  User →  admin"
echo "  Pass →  $(grep N8N_BASIC_AUTH_PASSWORD .env.prod | cut -d= -f2)"
echo ""
echo "  NEXT STEPS:"
echo "  1. Open https://${SUBDOMAIN} in your browser"
echo "  2. Import workflows (workflow.json)"
echo "  3. Re-connect Google Sheets + Gmail credentials"
echo "  4. Test a manual workflow run"
echo ""
