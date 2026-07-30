/**
 * Add Gmail draft creation (no auto-send) to startup-targets workflow.
 * Run after patch-startup-action-queue.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wfPath = path.resolve(__dirname, '..', 'workflow-startup-targets.json');
const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));

const HEADERS = [
  'company',
  'location',
  'one_liner',
  'funding_stage',
  'funding_amount',
  'funding_date',
  'total_raised_note',
  'source',
  'website',
  'linkedin_url',
  'careers_url',
  'apply_email',
  'next_action',
  'next_action_url',
  'hiring_pm',
  'pm_job_urls',
  'pm_job_titles',
  'priority',
  'priority_score',
  'status',
  'last_funded_check',
  'last_hiring_check',
  'last_draft_at',
  'notes',
];

function ensureHeader(code) {
  if (code.includes("'last_draft_at'") || code.includes('"last_draft_at"')) return code;
  return code
    .replace(/'last_hiring_check',\s*'notes'/g, "'last_hiring_check','last_draft_at','notes'")
    .replace(/"last_hiring_check",\s*"notes"/g, '"last_hiring_check","last_draft_at","notes"')
    .replace(
      /('last_hiring_check',\s*)\n(\s*)('notes')/,
      "$1\n$2'last_draft_at',\n$2$3",
    );
}

for (const name of [
  '🧠 Merge Enrich Score',
  '🧠 Free Hiring Check + Digest',
  '📋 Prep Sheet Rows',
  '📋 Re-emit Rows After Clear',
]) {
  if (byName[name]?.parameters?.jsCode) {
    byName[name].parameters.jsCode = ensureHeader(byName[name].parameters.jsCode);
  }
}

// Merge Enrich: load + emptyRow last_draft_at
{
  let code = byName['🧠 Merge Enrich Score'].parameters.jsCode;
  if (!code.includes('last_draft_at:')) {
    code = code.replace(
      "last_hiring_check: '', notes: '', ...o,",
      "last_hiring_check: '', last_draft_at: '', notes: '', ...o,",
    );
  }
  if (!code.includes('last_draft_at: j.last_draft_at')) {
    code = code.replace(
      "last_hiring_check: j.last_hiring_check || '',\n  notes: j.notes || '',",
      "last_hiring_check: j.last_hiring_check || '',\n  last_draft_at: j.last_draft_at || '',\n  notes: j.notes || '',",
    );
  }
  // Preserve last_draft_at on merge enrich fields
  if (!code.includes("'last_draft_at'")) {
    code = code.replace(
      "for (const f of ['website','linkedin_url','careers_url','apply_email','hiring_pm','pm_job_urls','pm_job_titles','last_hiring_check']) {",
      "for (const f of ['website','linkedin_url','careers_url','apply_email','hiring_pm','pm_job_urls','pm_job_titles','last_hiring_check','last_draft_at']) {",
    );
  }
  byName['🧠 Merge Enrich Score'].parameters.jsCode = code;
}

// Config knobs
{
  const cfg = byName['⚙️ Config'];
  const assigns = cfg.parameters.assignments.assignments;
  const ensure = (id, name, value, type) => {
    if (assigns.some((a) => a.name === name)) return;
    assigns.push({ id, name, value, type });
  };
  ensure('c14', 'draftEmailsEnabled', 'true', 'string');
  ensure('c15', 'maxDraftsPerRun', 8, 'number');
  ensure('c16', 'candidateName', 'Sakshi Chaudhary', 'string');
  ensure('c17', 'candidateEmail', 'ch.sakshiasb@gmail.com', 'string');
  ensure('c18', 'candidateLinkedin', 'https://www.linkedin.com/in/fabsakshi', 'string');
  ensure('c19', 'candidatePortfolio', 'https://ai-product-sakshi.netlify.app', 'string');
  ensure('c20', 'draftCooldownDays', 14, 'number');
}

const BUILD_DRAFTS = `
const cfg = $('⚙️ Config').first().json;
const prev = $input.first().json;
let rows = (prev.rows || []).map(r => ({ ...r }));
const today = new Date().toISOString().slice(0, 10);
const enabled = String(cfg.draftEmailsEnabled || 'true') !== 'false';
const maxDrafts = Math.min(Number(cfg.maxDraftsPerRun || 8), 15);
const cooldown = Number(cfg.draftCooldownDays || 14);
const candidateName = String(cfg.candidateName || 'Sakshi Chaudhary').trim();
const candidateEmail = String(cfg.candidateEmail || 'ch.sakshiasb@gmail.com').trim();
const linkedin = String(cfg.candidateLinkedin || 'https://www.linkedin.com/in/fabsakshi').trim();
const portfolio = String(cfg.candidatePortfolio || 'https://ai-product-sakshi.netlify.app').trim();

const DONE = new Set(['Applied', 'Contacted', 'Skip']);
function isDone(s) { return DONE.has(String(s || '').trim()); }
function daysSince(iso) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 86400000;
}
function firstJob(row) {
  return String(row.pm_job_urls || '').split(' | ').map(s => s.trim()).filter(Boolean)[0] || '';
}
function firstTitle(row) {
  return String(row.pm_job_titles || '').split(' | ').map(s => s.trim()).filter(Boolean)[0] || '';
}
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function fundingSnippet(row) {
  return [row.funding_amount, row.funding_stage, row.funding_date].filter(Boolean).join(' · ')
    || row.total_raised_note || 'your recent funding round';
}

function buildApplyBody(row) {
  const role = firstTitle(row) || 'Product Manager / Product Owner';
  const job = firstJob(row);
  const lines = [];
  lines.push(\`Hi \${row.company} team,\`);
  lines.push('');
  lines.push(\`I'm \${candidateName}, a Product Manager (~3.5 YOE) based in Berlin. I saw you're hiring for \${role}\${job ? '' : ' / open product roles'} and wanted to reach out directly.\`);
  lines.push('');
  lines.push('Recently I\\'ve owned B2B SaaS discovery → delivery (backlog, PRDs, release planning) with cross-functional teams, and I\\'m looking for a PM role at a growing German startup.');
  if (row.one_liner) lines.push(\`\${row.company}\\'s focus on \${row.one_liner} is especially interesting to me.\`);
  lines.push('');
  if (job) lines.push(\`Role I\\'m looking at: \${job}\`);
  if (row.careers_url && row.careers_url !== job) lines.push(\`Careers: \${row.careers_url}\`);
  lines.push('');
  lines.push('Happy to share a tailored CV/CL, or jump on a short call if useful. What\\'s the best next step on your side?');
  lines.push('');
  lines.push('Best,');
  lines.push(candidateName);
  lines.push(candidateEmail);
  lines.push(linkedin);
  lines.push(portfolio);
  return lines.join('\\n');
}

function buildContactBody(row) {
  const fund = fundingSnippet(row);
  const lines = [];
  lines.push(\`Hi \${row.company} team,\`);
  lines.push('');
  lines.push(\`I'm \${candidateName}, a Product Manager based in Berlin (~3.5 YOE, B2B SaaS / product strategy). Congrats on \${fund} — exciting milestone.\`);
  lines.push('');
  lines.push('I\\'m exploring PM / Product Owner roles at recently funded startups in Germany. If you\\'re hiring (or expect to soon), I\\'d love to be considered or get a pointer to the right person.');
  if (row.one_liner) lines.push(\`Your work around \${row.one_liner} maps well to problems I\\'ve shipped against.\`);
  lines.push('');
  if (row.careers_url) lines.push(\`I found: \${row.careers_url}\`);
  else if (row.website) lines.push(\`Website: \${row.website}\`);
  lines.push('');
  lines.push('I can send a short CV tailored to your stage/stack. Open to email or 15 minutes whenever convenient.');
  lines.push('');
  lines.push('Thanks for reading,');
  lines.push(candidateName);
  lines.push(candidateEmail);
  lines.push(linkedin);
  lines.push(portfolio);
  return lines.join('\\n');
}

function emailLooksUsable(email, company) {
  const e = String(email || '').toLowerCase().trim();
  if (!e.includes('@') || e.length > 80) return false;
  if (/(noreply|no-reply|donotreply|privacy|legal|newsletter|marketing|sentry\\.io|wixpress|example\\.com)/i.test(e)) return false;
  // Drop obvious wrong-domain celebs/brands unless company matches
  const domain = e.split('@')[1] || '';
  const companyKey = String(company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^(tesla|google|microsoft|amazon|apple|meta|facebook)\\./i.test(domain) && !companyKey.includes(domain.split('.')[0])) {
    return false;
  }
  return true;
}
function isPmishTitle(row) {
  const t = String(row.pm_job_titles || '');
  if (!t) return false;
  if (/\\b(intern|werkstudent|working student|chief of staff|assistant)\\b/i.test(t) && !/\\bproduct\\b/i.test(t)) return false;
  return /\\bproduct\\s*(manager|owner|ops|operations|analyst)?\\b/i.test(t) || /\\bpm\\b/i.test(t);
}

const pool = rows
  .filter(r => !isDone(r.status))
  .filter(r => emailLooksUsable(r.apply_email, r.company))
  .filter(r => r.next_action === 'Apply now' || r.next_action === 'Find contact')
  .filter(r => daysSince(r.last_draft_at) > cooldown)
  .sort((a, b) => {
    const rank = (r) => (r.next_action === 'Apply now' && isPmishTitle(r) ? 0 : r.next_action === 'Apply now' ? 1 : 2);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return Number(b.priority_score || 0) - Number(a.priority_score || 0);
  });

const draftCandidates = [];
if (enabled) {
  for (const r of pool.slice(0, maxDrafts)) {
    const isApply = r.next_action === 'Apply now' && isPmishTitle(r);
    const role = firstTitle(r);
    const subject = isApply
      ? (role ? \`Interest in \${role} — \${r.company}\` : \`Product role at \${r.company} — \${candidateName}\`)
      : \`Product Manager — \${r.company} (Berlin)\`;
    const body = isApply ? buildApplyBody(r) : buildContactBody(r);
    draftCandidates.push({
      company: r.company,
      to: String(r.apply_email).trim().toLowerCase(),
      subject,
      message: body,
      next_action: r.next_action,
      priority: r.priority,
    });
    // mark row so we don't re-draft next run
    const idx = rows.findIndex(x => x.company === r.company);
    if (idx >= 0) rows[idx] = { ...rows[idx], last_draft_at: today };
  }
}

let digestHtml = String(prev.digestHtml || '');
const draftBlock = [];
draftBlock.push(\`<h3>4) Gmail drafts created (\${draftCandidates.length}) — not sent</h3>\`);
if (!enabled) {
  draftBlock.push('<p>Draft emails disabled in Config (<code>draftEmailsEnabled=false</code>).</p>');
} else if (!draftCandidates.length) {
  draftBlock.push('<p>No new drafts this run (need <b>apply_email</b>, open status, and outside draft cooldown).</p>');
} else {
  draftBlock.push('<p>Review in <b>Gmail → Drafts</b>, edit, then send manually. After sending, set sheet <b>status=Contacted</b> or <b>Applied</b>.</p>');
  draftBlock.push('<ol>');
  for (const d of draftCandidates) {
    draftBlock.push(
      \`<li><b>\${esc(d.company)}</b> → \${esc(d.to)}<br><span style="color:#555">\${esc(d.subject)}</span></li>\`
    );
  }
  draftBlock.push('</ol>');
}
if (digestHtml.includes('</h3>')) {
  digestHtml = digestHtml + '\\n' + draftBlock.join('\\n');
} else {
  digestHtml = digestHtml + '\\n' + draftBlock.join('\\n');
}

return [{
  json: {
    ...prev,
    rows,
    digestHtml,
    draftCandidates,
    draftsCreated: draftCandidates.length,
  }
}];
`;

const EXPAND_DRAFTS = `
const summary = $input.first().json;
const drafts = summary.draftCandidates || [];
if (!drafts.length) {
  return [];
}
return drafts.map(d => ({
  json: {
    to: d.to,
    subject: d.subject,
    message: d.message,
    company: d.company,
    next_action: d.next_action,
  }
}));
`;

// Insert Build Drafts between Free Hiring and Expand
const buildNode = {
  parameters: {
    mode: 'runOnceForAllItems',
    jsCode: BUILD_DRAFTS,
  },
  id: 'build-cold-email-drafts',
  name: '📝 Build Cold Email Drafts',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1720, 400],
};

const expandDraftsNode = {
  parameters: {
    mode: 'runOnceForAllItems',
    jsCode: EXPAND_DRAFTS,
  },
  id: 'expand-draft-items',
  name: '📤 Expand Draft Items',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [3160, 40],
};

const gmailCred = byName['📧 Email Digest']?.credentials?.gmailOAuth2 || {
  id: 'u2pr9rKiXbazj7bS',
  name: 'Gmail account',
};

const createDraftNode = {
  parameters: {
    authentication: 'oAuth2',
    resource: 'draft',
    operation: 'create',
    subject: '={{ $json.subject }}',
    emailType: 'text',
    message: '={{ $json.message }}',
    options: {
      sendTo: '={{ $json.to }}',
    },
  },
  id: 'create-gmail-drafts',
  name: '📧 Create Gmail Drafts',
  type: 'n8n-nodes-base.gmail',
  typeVersion: 2.1,
  position: [3400, 40],
  credentials: {
    gmailOAuth2: gmailCred,
  },
  onError: 'continueRegularOutput',
};

// Remove old nodes if re-running
wf.nodes = wf.nodes.filter(
  (n) =>
    !['📝 Build Cold Email Drafts', '📤 Expand Draft Items', '📧 Create Gmail Drafts'].includes(
      n.name,
    ),
);
wf.nodes.push(buildNode, expandDraftsNode, createDraftNode);

// Rewire Free Hiring → Build Drafts → Expand
wf.connections['🧠 Free Hiring Check + Digest'] = {
  main: [[{ node: '📝 Build Cold Email Drafts', type: 'main', index: 0 }]],
};
wf.connections['📝 Build Cold Email Drafts'] = {
  main: [[{ node: '📤 Expand Rows For Sheet', type: 'main', index: 0 }]],
};

// Summary IF also fans out to Expand Draft Items
const summaryConn = wf.connections['❓ Is Summary Item?'];
const trueBranch = summaryConn.main[0] || [];
if (!trueBranch.some((c) => c.node === '📤 Expand Draft Items')) {
  trueBranch.push({ node: '📤 Expand Draft Items', type: 'main', index: 0 });
}
summaryConn.main[0] = trueBranch;

wf.connections['📤 Expand Draft Items'] = {
  main: [[{ node: '📧 Create Gmail Drafts', type: 'main', index: 0 }]],
};

// Expand Rows: pass draftsCreated through summary
{
  let code = byName['📤 Expand Rows For Sheet'].parameters.jsCode;
  if (!code.includes('draftsCreated')) {
    code = code.replace(
      'out[0].json._findContact = summary.findContact;',
      "out[0].json._findContact = summary.findContact;\nout[0].json._draftsCreated = summary.draftsCreated;",
    );
    code = code.replace(
      'findContact: summary.findContact,',
      'findContact: summary.findContact,\n  draftsCreated: summary.draftsCreated,\n  draftCandidates: summary.draftCandidates,',
    );
  }
  byName['📤 Expand Rows For Sheet'].parameters.jsCode = code;
}

// Email subject includes drafts
byName['📧 Email Digest'].parameters.subject =
  "=🇩🇪 Action queue — {{ $json.applyNow || 0 }} apply · {{ $json.findContact || 0 }} find contact · {{ $json.draftsCreated || 0 }} drafts · {{ $now.toFormat('MMM d, yyyy') }}";

// Rewrite schema headers if present
const rewrite = byName['📊 Rewrite Target Companies'];
if (rewrite?.parameters?.columns?.schema) {
  rewrite.parameters.columns.schema = HEADERS.map((id) => ({
    id,
    displayName: id,
    required: false,
    defaultMatch: id === 'company',
    display: true,
    type: 'string',
    canBeUsedToMatch: id === 'company',
  }));
}

fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + '\n');
console.log('Patched draft-email flow into', wfPath);
console.log('Nodes:', wf.nodes.map((n) => n.name).filter((n) => /Draft|Build Cold/i.test(n)));
