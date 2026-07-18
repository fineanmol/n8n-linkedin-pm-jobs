#!/usr/bin/env bash
# =============================================================================
#  backup-n8n.sh — Export all n8n workflows + credentials to a zip
#
#  Run on your LOCAL machine BEFORE migrating to Oracle Cloud.
#  Creates: n8n-export-YYYY-MM-DD.tar.gz
# =============================================================================
set -euo pipefail

DATE=$(date +%Y-%m-%d)
EXPORT_DIR="/tmp/n8n-export-$DATE"
ARCHIVE="n8n-export-$DATE.tar.gz"

echo "Exporting n8n data..."
mkdir -p "$EXPORT_DIR"

# Export workflows via API
curl -s -b /tmp/n8n_cookie.txt \
  "http://localhost:5678/rest/workflows" | \
  python3 -c "
import sys, json
data = json.loads(sys.stdin.read()).get('data', [])
print(f'Found {len(data)} workflows')
with open('$EXPORT_DIR/all-workflows.json', 'w') as f:
    json.dump(data, f, indent=2)
"

# Copy the SQLite database (contains all credentials encrypted)
if [ -f "$HOME/.n8n/database.sqlite" ]; then
  cp "$HOME/.n8n/database.sqlite" "$EXPORT_DIR/database.sqlite"
  echo "Copied SQLite database"
fi

# Copy encryption key if set
if [ -f "$HOME/.n8n/.env" ]; then
  cp "$HOME/.n8n/.env" "$EXPORT_DIR/.n8n.env"
fi

# Copy workflow JSON files from this project
cp "$(dirname "$0")/workflow.json" "$EXPORT_DIR/" 2>/dev/null || true

# Package
cd /tmp
tar czf "$(dirname "$0")/$ARCHIVE" "n8n-export-$DATE/"
rm -rf "$EXPORT_DIR"

echo ""
echo "✅ Export saved: $ARCHIVE"
echo ""
echo "  Transfer to Oracle Cloud with:"
echo "    scp $ARCHIVE ubuntu@<YOUR_VM_IP>:~/n8n-automation/"
echo ""
echo "  ⚠️  The database contains encrypted credentials."
echo "     You need the SAME N8N_ENCRYPTION_KEY on the server to decrypt them."
echo "     Check it in your current .env file or n8n logs."
