#!/usr/bin/env bash
# Import the workflow into a fresh n8n instance.
# Run AFTER docker-compose up and n8n is healthy.

set -euo pipefail

N8N_URL="${N8N_URL:-http://localhost:5678}"
USER="${N8N_BASIC_AUTH_USER:-admin}"
PASS="${N8N_BASIC_AUTH_PASSWORD:-changeme}"
WORKFLOW_FILE="$(dirname "$0")/../workflow.json"

echo "Waiting for n8n to be ready..."
until curl -sf -u "$USER:$PASS" "$N8N_URL/healthz" > /dev/null 2>&1; do
  sleep 3
done
echo "n8n is up."

echo "Importing workflow..."
curl -sf -X POST "$N8N_URL/rest/workflows" \
  -u "$USER:$PASS" \
  -H "Content-Type: application/json" \
  -d @"$WORKFLOW_FILE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
wf_id = d.get('data', {}).get('id') or d.get('id')
name  = d.get('data', {}).get('name') or d.get('name')
print(f'✅ Workflow imported: \"{name}\" (id={wf_id})')
print()
print('Next steps:')
print('  1. Open n8n UI → Credentials → add Google Sheets, Gmail, Google Docs')
print('  2. Open the ⚙️ Config node and fill in YOUR values')
print('  3. Activate the workflow')
"
