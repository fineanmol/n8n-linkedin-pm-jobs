/**
 * Push local workflow-startup-targets.json code/email changes to live n8n.
 *
 * Requires:
 *   N8N_URL=https://n8n.fineanmol.dev
 *   N8N_API_KEY=...
 *
 * Usage:
 *   export N8N_URL=https://n8n.fineanmol.dev N8N_API_KEY=...
 *   node scripts/sync-startup-targets-to-n8n.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const wfPath = path.join(root, 'workflow-startup-targets.json');
const workflowId = process.env.N8N_WORKFLOW_ID || 'XCzeLgTXXU8o5p1v';
const base = (process.env.N8N_URL || 'https://n8n.fineanmol.dev').replace(/\/$/, '');
const apiKey = process.env.N8N_API_KEY || '';

if (!apiKey) {
  console.error('Missing N8N_API_KEY. Create one in n8n → Settings → API, then export it.');
  process.exit(1);
}

const local = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
const byName = Object.fromEntries((local.nodes || []).map((n) => [n.name, n]));

const res = await fetch(`${base}/api/v1/workflows/${workflowId}`, {
  headers: { 'X-N8N-API-KEY': apiKey, Accept: 'application/json' },
});
if (!res.ok) {
  console.error('GET failed', res.status, await res.text());
  process.exit(1);
}
const remote = await res.json();
const nodes = remote.nodes || remote.data?.nodes || [];
const settings = remote.settings || remote.data?.settings || {};
const name = remote.name || remote.data?.name || local.name;
const connections = remote.connections || remote.data?.connections || local.connections;

const patchNames = [
  '🧠 Merge Enrich Score',
  '🧠 Free Hiring Check + Digest',
  '📋 Prep Sheet Rows',
  '📋 Re-emit Rows After Clear',
  '📤 Expand Rows For Sheet',
  '📧 Email Digest',
  '📊 Rewrite Target Companies',
];

let patched = 0;
for (const n of nodes) {
  if (!patchNames.includes(n.name) || !byName[n.name]) continue;
  if (byName[n.name].parameters?.jsCode) {
    n.parameters = { ...n.parameters, jsCode: byName[n.name].parameters.jsCode };
    patched++;
  }
  if (n.name === '📧 Email Digest' && byName[n.name].parameters?.subject) {
    n.parameters = { ...n.parameters, subject: byName[n.name].parameters.subject };
    patched++;
  }
  if (n.name === '📊 Rewrite Target Companies' && byName[n.name].parameters?.columns) {
    n.parameters = {
      ...n.parameters,
      columns: {
        ...(n.parameters.columns || {}),
        ...byName[n.name].parameters.columns,
      },
    };
    patched++;
  }
}

const body = {
  name,
  nodes,
  connections,
  settings,
};

const put = await fetch(`${base}/api/v1/workflows/${workflowId}`, {
  method: 'PUT',
  headers: {
    'X-N8N-API-KEY': apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  body: JSON.stringify(body),
});
const text = await put.text();
if (!put.ok) {
  console.error('PUT failed', put.status, text.slice(0, 500));
  process.exit(1);
}
console.log(`Synced ${patched} node fields → ${base}/workflow/${workflowId}`);
console.log('If the workflow is published, publish again (or activate) so production uses the new draft.');
