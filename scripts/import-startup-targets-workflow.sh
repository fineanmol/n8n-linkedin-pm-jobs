#!/usr/bin/env bash
# Import DE Funded Startups → PM Targets into n8n (server-side workflow only).
set -euo pipefail

N8N_URL="${N8N_URL:-http://localhost:5678}"
USER="${N8N_BASIC_AUTH_USER:-admin}"
PASS="${N8N_BASIC_AUTH_PASSWORD:-changeme}"
WORKFLOW_FILE="$(dirname "$0")/../workflow-startup-targets.json"

echo "Waiting for n8n at $N8N_URL ..."
until curl -sf -u "$USER:$PASS" "$N8N_URL/healthz" > /dev/null 2>&1; do
  sleep 3
done

echo "Importing $(basename "$WORKFLOW_FILE") ..."
curl -sf -X POST "$N8N_URL/rest/workflows" \
  -u "$USER:$PASS" \
  -H "Content-Type: application/json" \
  -d @"$WORKFLOW_FILE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
wf_id = d.get('data', {}).get('id') or d.get('id')
name  = d.get('data', {}).get('name') or d.get('name')
print(f'Imported: \"{name}\" (id={wf_id})')
print('Next:')
print('  1. Open workflow → attach Google Sheets + Gmail credentials (same as jobs WF)')
print('  2. Config: spreadsheet ID, Apify key, email')
print('  3. First run: forceImportSeed=true → Execute once')
print('  4. Then forceImportSeed=false → Activate (Mondays 08:00 Berlin)')
"
