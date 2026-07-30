/**
 * Patch workflow-startup-targets.json for action-queue digest + apply_email enrich.
 * Run: node scripts/patch-startup-action-queue.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const wfPath = path.join(root, 'workflow-startup-targets.json');

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

const MERGE_ENRICH = `
const cfg = $('⚙️ Config').first().json;
const lookback = Number(cfg.techEuLookbackDays || 14);
const maxEnrich = Number(cfg.maxEnrichPerRun || 40);
const forceSeed = String(cfg.forceImportSeed || 'false') === 'true';
const today = new Date().toISOString().slice(0, 10);

const LEGAL = /\\b(gmbh|ug|ag|se|kg|ohg|gbr|inc|incorporated|ltd|limited|llc|corp|corporation|co|company|holding|holdings|group|sa|bv|nv)\\b/gi;

function normalizeCompanyKey(name) {
  return String(name || '').toLowerCase().normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '').replace(/&/g, ' and ')
    .replace(LEGAL, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\\s+/g, ' ').trim();
}

function parseFundingBlob(raw) {
  const s = String(raw || '').trim();
  if (!s) return { funding_stage: '', funding_amount: '', total_raised_note: '' };
  const stageMatch = s.match(/\\b(pre[-\\s]?seed|seed|series\\s*[a-f]|series\\s*d\\+|growth|debt|bridge|extension)\\b/i);
  let funding_stage = stageMatch ? stageMatch[1].replace(/\\s+/g, ' ') : '';
  if (funding_stage) {
    funding_stage = funding_stage.split(' ').map(w => w.toLowerCase() === 'series' ? 'Series' : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      .replace(/Series\\s*([a-f])/i, (_, l) => \`Series \${l.toUpperCase()}\`);
  }
  const amountMatch = s.match(/([$€£]\\s?[\\d.,]+\\s?[kmb]?|[\\d.,]+\\s?[kmb]\\s?(?:eur|usd|€|\\$)?|mid[-\\s]?seven figures)/i);
  return { funding_stage, funding_amount: amountMatch ? amountMatch[0].replace(/\\s+/g, ' ').trim() : s, total_raised_note: s };
}

function formatAmountEur(amountEur) {
  if (amountEur == null) return '';
  if (amountEur >= 1e9) return \`€\${(amountEur / 1e9).toFixed(2)}B\`;
  if (amountEur >= 1e6) return \`€\${(amountEur / 1e6).toFixed(amountEur >= 1e7 ? 0 : 1)}M\`;
  if (amountEur >= 1e3) return \`€\${Math.round(amountEur / 1e3)}k\`;
  return \`€\${amountEur}\`;
}

function emptyRow(o = {}) {
  return {
    company: '', location: '', one_liner: '', funding_stage: '', funding_amount: '', funding_date: '',
    total_raised_note: '', source: '', website: '', linkedin_url: '', careers_url: '',
    apply_email: '', next_action: 'Watch', next_action_url: '',
    hiring_pm: 'Unknown', pm_job_urls: '', pm_job_titles: '', priority: 'Medium', priority_score: '50',
    status: 'Watch', last_funded_check: '', last_hiring_check: '', last_draft_at: '', notes: '', ...o,
  };
}

function firstJobUrl(row) {
  return String(row.pm_job_urls || '').split(' | ').map(s => s.trim()).filter(Boolean)[0] || '';
}

const DONE_STATUSES = new Set(['Applied', 'Contacted', 'Skip']);
function normalizeStatus(s) {
  const raw = String(s || '').trim();
  const map = {
    applied: 'Applied', contacted: 'Contacted', skip: 'Skip', skipped: 'Skip',
    watch: 'Watch', 'ready to apply': 'Ready to Apply', ready: 'Ready to Apply',
  };
  return map[raw.toLowerCase()] || raw || 'Watch';
}
function isDoneStatus(status) {
  return DONE_STATUSES.has(normalizeStatus(status));
}

function assignAction(row) {
  const status = normalizeStatus(row.status);
  if (status === 'Applied') {
    return { ...row, status, next_action: 'Applied', next_action_url: firstJobUrl(row) || row.careers_url || row.website || '' };
  }
  if (status === 'Contacted') {
    return { ...row, status, next_action: 'Contacted', next_action_url: row.apply_email ? \`mailto:\${row.apply_email}\` : (row.careers_url || row.website || '') };
  }
  if (status === 'Skip') {
    return { ...row, status, next_action: 'Skip', next_action_url: '' };
  }
  const job0 = firstJobUrl(row);
  if (row.hiring_pm === 'Yes' && (job0 || row.careers_url || row.apply_email)) {
    const next_action_url = job0 || row.careers_url || (row.apply_email ? \`mailto:\${row.apply_email}\` : row.website || '');
    return { ...row, status: status === 'Ready to Apply' ? status : 'Ready to Apply', next_action: 'Apply now', next_action_url };
  }
  if ((row.priority === 'High' || row.priority === 'Medium') && (row.website || row.careers_url || row.apply_email)) {
    const next_action_url = row.apply_email
      ? \`mailto:\${row.apply_email}\`
      : (row.careers_url || row.website || '');
    return { ...row, status: status || 'Watch', next_action: 'Find contact', next_action_url };
  }
  return { ...row, status: status || 'Watch', next_action: 'Watch', next_action_url: row.careers_url || row.website || '' };
}

function scoreTargetRow(row) {
  let score = 40;
  const l = String(row.location || '').toLowerCase();
  if (/\\b(berlin|potsdam)\\b/.test(l)) score += 25;
  else if (/\\b(munich|münchen|hamburg|cologne|köln|frankfurt)\\b/.test(l)) score += 15;
  else if (l) score += 5;
  const s = String(row.funding_stage || '').toLowerCase();
  if (/pre[-\\s]?seed|seed/.test(s)) score += 20;
  else if (/series\\s*a/.test(s)) score += 18;
  else if (/series\\s*b/.test(s)) score += 12;
  else if (/series\\s*c/.test(s)) score += 4;
  else if (/series\\s*[def]|growth|d\\+/.test(s)) score -= 8;
  else score += 6;
  const hiring = String(row.hiring_pm || 'Unknown');
  if (hiring === 'Yes') score += 30;
  else if (hiring === 'No') score -= 10;
  const titles = String(row.pm_job_titles || '');
  if (/\\bproduct (manager|owner)\\b/i.test(titles)) score += 15;
  if (row.apply_email) score += 8;
  if (row.careers_url) score += 4;
  const blurb = \`\${row.one_liner || ''} \${row.notes || ''}\`.toLowerCase();
  if (/\\b(hardware|robotics|deeptech|semiconductor|battery|fusion)\\b/.test(blurb) && hiring !== 'Yes') score -= 8;
  if (/\\b(saas|b2b|ai|software|platform|marketplace)\\b/.test(blurb)) score += 6;
  score = Math.max(0, Math.min(100, Math.round(score)));
  let priority = score >= 70 ? 'High' : score < 45 ? 'Low' : 'Medium';
  // status from sheet is sticky for Applied / Contacted / Skip
  let status = normalizeStatus(row.status || 'Watch');
  if (!isDoneStatus(status)) {
    if (priority === 'High' && hiring === 'Yes') status = 'Ready to Apply';
  }
  return assignAction({ ...row, priority_score: String(score), priority, status });
}

function mergeTargetRows(existing, incoming) {
  if (!existing) return { ...incoming };
  const out = { ...existing };
  for (const f of ['location','one_liner','funding_stage','funding_amount','funding_date','total_raised_note']) {
    if (incoming[f]) out[f] = incoming[f];
  }
  if (incoming.source && existing.source && incoming.source !== existing.source) out.source = 'both';
  else if (incoming.source) out.source = existing.source && existing.source !== incoming.source ? 'both' : incoming.source;
  if (incoming.last_funded_check) out.last_funded_check = incoming.last_funded_check;
  if (incoming.notes && !String(existing.notes || '').includes(incoming.notes)) {
    out.notes = [existing.notes, incoming.notes].filter(Boolean).join(' | ').slice(0, 500);
  }
  // Enrich fields only — never overwrite sticky sheet status / action from funding imports
  for (const f of ['website','linkedin_url','careers_url','apply_email','hiring_pm','pm_job_urls','pm_job_titles','last_hiring_check']) {
    if (incoming[f] !== undefined && incoming[f] !== '' && incoming[f] != null) out[f] = incoming[f];
  }
  out.status = normalizeStatus(existing.status || out.status || 'Watch');
  return out;
}

function parseCsv(text) {
  const rows = []; let i = 0; let field = ''; let row = []; let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i += 2; continue; } inQuotes = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\\n' || c === '\\r') {
      if (c === '\\r' && text[i+1] === '\\n') i++;
      row.push(field); rows.push(row); row = []; field = ''; i++; continue;
    }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map(h => String(h || '').trim());
  return rows.slice(1).filter(cols => cols.some(Boolean)).map(cols => {
    const obj = {}; headers.forEach((h, idx) => { obj[h] = cols[idx] ?? ''; }); return obj;
  });
}

async function headOk(url) {
  try {
    const res = await this.helpers.httpRequest({
      method: 'GET', url, timeout: 4000, returnFullResponse: true,
      ignoreHttpStatusErrors: true,
      headers: { 'User-Agent': 'n8n-startup-targets/1.0' },
    });
    const code = res.statusCode || res.status || 0;
    return code >= 200 && code < 400;
  } catch (e) { return false; }
}

// --- load existing sheet rows ---
const sheetItems = $('📊 Read Target Companies').all().map(i => i.json).filter(j => {
  const c = String(j?.company || j?.Company || '').trim().toLowerCase();
  return c && c !== 'company' && c !== 'name';
});
const existing = sheetItems.map(j => emptyRow({
  company: j.company || j.Company || '',
  location: j.location || j.Location || '',
  one_liner: j.one_liner || j['What they do'] || '',
  funding_stage: j.funding_stage || '',
  funding_amount: j.funding_amount || '',
  funding_date: j.funding_date || '',
  total_raised_note: j.total_raised_note || j.Funding || '',
  source: j.source || 'sheet',
  website: j.website || '',
  linkedin_url: j.linkedin_url || '',
  careers_url: j.careers_url || '',
  apply_email: j.apply_email || '',
  next_action: j.next_action || 'Watch',
  next_action_url: j.next_action_url || '',
  hiring_pm: j.hiring_pm || 'Unknown',
  pm_job_urls: j.pm_job_urls || '',
  pm_job_titles: j.pm_job_titles || '',
  priority: j.priority || 'Medium',
  priority_score: String(j.priority_score || '50'),
  status: normalizeStatus(j.status || 'Watch'),
  last_funded_check: j.last_funded_check || '',
  last_hiring_check: j.last_hiring_check || '',
  notes: j.notes || '',
}));

const byKey = new Map();
for (const r of existing) {
  const k = normalizeCompanyKey(r.company);
  if (k) byKey.set(k, r);
}
const beforeKeys = new Set(byKey.keys());

// --- seed CSV ---
const seedNode = $('🌐 Maybe Fetch Seed CSV').first();
const seedStr = (() => {
  const j = seedNode.json;
  if (typeof j === 'string') return j;
  if (typeof j.data === 'string') return j.data;
  if (typeof j.body === 'string') return j.body;
  const vals = Object.values(j || {});
  if (vals.length === 1 && typeof vals[0] === 'string' && vals[0].includes('Company')) return vals[0];
  return String(j?.content || '');
})();

const importSeed = forceSeed || byKey.size === 0;
let seedImported = 0;
if (!seedStr || seedStr.length < 20) {
  console.log('Seed CSV empty or unreadable — skipping seed import');
}
if (importSeed && seedStr && seedStr.includes(',')) {
  for (const s of parseCsv(seedStr)) {
    const company = s.Company || s.company || '';
    if (!company.trim()) continue;
    const parsed = parseFundingBlob(s.Funding || s.funding || '');
    const incoming = emptyRow({
      company: company.trim(),
      location: (s.Location || s.location || '').trim(),
      one_liner: (s['What they do'] || s.one_liner || '').trim(),
      funding_stage: parsed.funding_stage,
      funding_amount: parsed.funding_amount,
      total_raised_note: parsed.total_raised_note,
      source: 'seed_sheet',
      last_funded_check: today,
    });
    const key = normalizeCompanyKey(company);
    byKey.set(key, scoreTargetRow(mergeTargetRows(byKey.get(key), incoming)));
    seedImported++;
  }
}

// --- Tech.eu rounds ---
const techBody = $('🌐 Fetch Tech.eu Rounds').first().json || {};
const rounds = Array.isArray(techBody?.data) ? techBody.data : (Array.isArray(techBody) ? techBody : []);
if (!rounds.length) {
  console.log('Tech.eu empty/rate-limited:', techBody?.message || techBody?.error || 'no data');
}
const latestByCompany = new Map();
for (const round of rounds) {
  const name = round?.company?.name;
  if (!name) continue;
  const key = normalizeCompanyKey(name);
  const prev = latestByCompany.get(key);
  if (!prev || String(round.date) > String(prev.date)) latestByCompany.set(key, round);
}
let fundingTouched = 0;
for (const round of latestByCompany.values()) {
  const company = round.company || {};
  const amount = formatAmountEur(round.amountEur);
  const stage = round.stage || round.rawRoundType || '';
  const incoming = emptyRow({
    company: String(company.name || '').trim(),
    location: String(company.city || company.country || '').trim(),
    one_liner: Array.isArray(company.sectors) ? company.sectors.join(', ') : '',
    funding_stage: stage,
    funding_amount: amount,
    funding_date: round.date || '',
    total_raised_note: [amount, stage, round.date].filter(Boolean).join(' · '),
    source: 'tech.eu',
    last_funded_check: today,
    notes: round.source?.domain ? \`tech.eu via \${round.source.domain}\` : 'tech.eu',
  });
  const key = normalizeCompanyKey(incoming.company);
  byKey.set(key, scoreTargetRow(mergeTargetRows(byKey.get(key), incoming)));
  fundingTouched++;
}

// --- enrich websites (capped) ---
let rows = [...byKey.values()];
const HARD_ENRICH_CAP = Math.min(maxEnrich, 5);
const enrichQueue = rows
  .filter(r => (!r.website || !r.careers_url) && (r.last_funded_check === today || (r.source || '').includes('tech.eu')))
  .slice(0, HARD_ENRICH_CAP);
let enriched = 0;
for (const r of enrichQueue) {
  const slug = normalizeCompanyKey(r.company).replace(/\\s+/g, '');
  if (!slug) continue;
  const siteCands = [\`https://www.\${slug}.com\`,\`https://\${slug}.com\`,\`https://www.\${slug}.io\`,\`https://\${slug}.io\`,\`https://www.\${slug}.de\`,\`https://\${slug}.de\`,\`https://www.\${slug}.ai\`,\`https://\${slug}.ai\`];
  let website = r.website;
  if (!website) {
    for (const u of siteCands) {
      if (await headOk.call(this, u)) { website = u; break; }
    }
  }
  let careers = r.careers_url;
  if (website && !careers) {
    const base = website.replace(/\\/$/, '');
    for (const u of [\`\${base}/careers\`,\`\${base}/jobs\`,\`\${base}/career\`,\`\${base}/en/careers\`,\`\${base}/join\`]) {
      if (await headOk.call(this, u)) { careers = u; break; }
    }
  }
  if (website || careers) {
    const key = normalizeCompanyKey(r.company);
    const cur = byKey.get(key);
    byKey.set(key, { ...cur, website: website || cur.website, careers_url: careers || cur.careers_url });
    enriched++;
  }
}

rows = [...byKey.values()].map(scoreTargetRow);
const newlyAdded = rows.filter(r => !beforeKeys.has(normalizeCompanyKey(r.company)));

return [{
  json: {
    rows,
    newlyAddedCount: newlyAdded.length,
    newlyAdded: newlyAdded.slice(0, 30),
    fundingTouched,
    seedImported,
    enriched,
    companyCount: rows.length,
    lookback,
    hiringCheckEnabled: String(cfg.hiringCheckEnabled || 'true') !== 'false',
    sheetUrl: cfg.sheetUrl || '',
    yourEmail: cfg.yourEmail || '',
  }
}];
`;

const FREE_HIRING = `
const cfg = $('⚙️ Config').first().json;
const prev = $('🧠 Merge Enrich Score').first().json;
let rows = (prev.rows || []).map(r => ({ ...r }));
const today = new Date().toISOString().slice(0, 10);
const lookback = Number(prev.lookback || cfg.techEuLookbackDays || 14);
const hiringEnabled = String(cfg.hiringCheckEnabled || 'true') !== 'false';
const maxChecks = Math.min(Number(cfg.maxHiringChecksPerRun || 25), 40);

const LEGAL = /\\b(gmbh|ug|ag|se|kg|ohg|gbr|inc|incorporated|ltd|limited|llc|corp|corporation|co|company|holding|holdings|group|sa|bv|nv)\\b/gi;
function normalizeCompanyKey(name) {
  return String(name || '').toLowerCase().normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '').replace(/&/g, ' and ')
    .replace(LEGAL, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\\s+/g, ' ').trim();
}
function daysSince(iso) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 86400000;
}
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function fetchText(url, timeout = 5000) {
  try {
    const res = await this.helpers.httpRequest({
      method: 'GET',
      url,
      timeout,
      returnFullResponse: true,
      ignoreHttpStatusErrors: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const code = res.statusCode || res.status || 0;
    const body = typeof res.body === 'string' ? res.body : (res.data || '');
    if (code >= 200 && code < 400 && body) return String(body);
  } catch (e) { /* ignore */ }
  return '';
}

function careersLooksLive(html) {
  if (!html || html.length < 200) return false;
  const h = html.toLowerCase();
  const blockers = ['page not found', '404', 'job board is empty', 'no open positions', 'no vacancies', 'currently no openings'];
  if (blockers.some(b => h.includes(b)) && !/(job|stelle|position|role)/i.test(h)) return false;
  const signals = [
    'greenhouse.io', 'lever.co', 'personio', 'workable.com', 'ashbyhq.com', 'smartrecruiters',
    'join.com', 'recruitee', 'jobvite', 'open position', 'open roles', 'we are hiring',
    "we're hiring", 'stellengesuch', 'stellenangebot', 'karriere', 'job openings',
    'view job', 'apply now', 'alle stellen', 'offene stellen', 'data-job', 'job-card',
  ];
  return signals.some(s => h.includes(s));
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g;
const MAILTO_RE = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})/gi;
const PREFERRED_LOCAL = /^(jobs|careers|talent|people|hr|join|hiring|work|recruiting|bewerbung|karriere)@/i;
const BAD_EMAIL = /(noreply|no-reply|donotreply|privacy|legal|newsletter|marketing|sentry\\.io|wixpress|example\\.com|domain\\.com|schema\\.org|png$|jpg$|gif$|svg$|webp$)/i;

function extractApplyEmail(html) {
  const found = new Set();
  const text = String(html || '');
  for (const m of text.matchAll(MAILTO_RE)) found.add(m[1].toLowerCase());
  for (const m of text.matchAll(EMAIL_RE)) found.add(m[0].toLowerCase());
  const emails = [...found].filter(e => !BAD_EMAIL.test(e) && e.includes('.') && e.length < 80);
  const preferred = emails.filter(e => PREFERRED_LOCAL.test(e));
  if (preferred.length) return preferred[0];
  const nonFree = emails.filter(e => !/@(gmail|googlemail|yahoo|hotmail|outlook|icloud)\\./i.test(e));
  return nonFree[0] || emails[0] || '';
}

function firstJobUrl(row) {
  return String(row.pm_job_urls || '').split(' | ').map(s => s.trim()).filter(Boolean)[0] || '';
}

const DONE_STATUSES = new Set(['Applied', 'Contacted', 'Skip']);
function normalizeStatus(s) {
  const raw = String(s || '').trim();
  const map = {
    applied: 'Applied', contacted: 'Contacted', skip: 'Skip', skipped: 'Skip',
    watch: 'Watch', 'ready to apply': 'Ready to Apply', ready: 'Ready to Apply',
  };
  return map[raw.toLowerCase()] || raw || 'Watch';
}
function isDoneStatus(status) {
  return DONE_STATUSES.has(normalizeStatus(status));
}

function assignAction(row) {
  const status = normalizeStatus(row.status);
  if (status === 'Applied') {
    return { ...row, status, next_action: 'Applied', next_action_url: firstJobUrl(row) || row.careers_url || row.website || '' };
  }
  if (status === 'Contacted') {
    return { ...row, status, next_action: 'Contacted', next_action_url: row.apply_email ? \`mailto:\${row.apply_email}\` : (row.careers_url || row.website || '') };
  }
  if (status === 'Skip') {
    return { ...row, status, next_action: 'Skip', next_action_url: '' };
  }
  const job0 = firstJobUrl(row);
  if (row.hiring_pm === 'Yes' && (job0 || row.careers_url || row.apply_email)) {
    const next_action_url = job0 || row.careers_url || (row.apply_email ? \`mailto:\${row.apply_email}\` : row.website || '');
    return { ...row, status: 'Ready to Apply', next_action: 'Apply now', next_action_url };
  }
  if ((row.priority === 'High' || row.priority === 'Medium') && (row.website || row.careers_url || row.apply_email)) {
    const next_action_url = row.apply_email
      ? \`mailto:\${row.apply_email}\`
      : (row.careers_url || row.website || '');
    return { ...row, status: status || 'Watch', next_action: 'Find contact', next_action_url };
  }
  return { ...row, status: status || 'Watch', next_action: 'Watch', next_action_url: row.careers_url || row.website || '' };
}

function scoreTargetRow(row) {
  let score = 40;
  const l = String(row.location || '').toLowerCase();
  if (/\\b(berlin|potsdam)\\b/.test(l)) score += 25;
  else if (/\\b(munich|münchen|hamburg|cologne|köln|frankfurt)\\b/.test(l)) score += 15;
  else if (l) score += 5;
  const s = String(row.funding_stage || '').toLowerCase();
  if (/pre[-\\s]?seed|seed/.test(s)) score += 20;
  else if (/series\\s*a/.test(s)) score += 18;
  else if (/series\\s*b/.test(s)) score += 12;
  else if (/series\\s*c/.test(s)) score += 4;
  else if (/series\\s*[def]|growth|d\\+/.test(s)) score -= 8;
  else score += 6;
  const hiring = String(row.hiring_pm || 'Unknown');
  if (hiring === 'Yes') score += 30;
  else if (hiring === 'No') score -= 10;
  if (/\\bproduct (manager|owner)\\b/i.test(String(row.pm_job_titles || ''))) score += 15;
  if (row.apply_email) score += 8;
  if (row.careers_url) score += 4;
  const blurb = \`\${row.one_liner || ''} \${row.notes || ''}\`.toLowerCase();
  if (/\\b(hardware|robotics|deeptech|semiconductor|battery|fusion)\\b/.test(blurb) && hiring !== 'Yes') score -= 8;
  if (/\\b(saas|b2b|ai|software|platform|marketplace)\\b/.test(blurb)) score += 6;
  score = Math.max(0, Math.min(100, Math.round(score)));
  let priority = score >= 70 ? 'High' : score < 45 ? 'Low' : 'Medium';
  let status = normalizeStatus(row.status || 'Watch');
  if (!isDoneStatus(status)) {
    if (priority === 'High' && hiring === 'Yes') status = 'Ready to Apply';
  }
  return assignAction({ ...row, priority_score: String(score), priority, status });
}

function parseLinkedInGuest(html, company) {
  const titles = [];
  const urls = [];
  const key = normalizeCompanyKey(company);
  const blocks = String(html || '').split(/<\\/li>/i);
  for (const block of blocks) {
    const id = (block.match(/data-entity-urn="urn:li:jobPosting:(\\d+)"/) || block.match(/\\/jobs\\/view\\/(\\d+)/) || [])[1];
    if (!id) continue;
    const title = ((block.match(/base-search-card__title[^>]*>\\s*([^<]+)/i) || [])[1] || '').trim();
    const comp = ((block.match(/base-search-card__subtitle[^>]*>[\\s\\S]*?<[^>]+>\\s*([^<]+)/i) || block.match(/base-search-card__subtitle[^>]*>\\s*([^<]+)/i) || [])[1] || '').trim();
    const compKey = normalizeCompanyKey(comp);
    if (!compKey) continue;
    if (!(compKey.includes(key) || key.includes(compKey) || key.split(' ').some(p => p.length > 3 && compKey.includes(p)))) {
      continue;
    }
    if (title && titles.length < 5) titles.push(title.replace(/\\s+/g, ' '));
    const u = \`https://www.linkedin.com/jobs/view/\${id}/\`;
    if (urls.length < 3) urls.push(u);
  }
  return { titles, urls };
}

const newlyNames = new Set((prev.newlyAdded || []).map(r => normalizeCompanyKey(r.company)));
const latestIdx = [];
rows.forEach((r, i) => {
  const k = normalizeCompanyKey(r.company);
  if (newlyNames.has(k) || (r.funding_date && daysSince(r.funding_date) <= lookback) ||
      (r.last_funded_check === today && String(r.source || '').includes('tech.eu'))) {
    latestIdx.push(i);
  }
});

let checked = 0;
let liHits = 0;
let careersHits = 0;
let emailHits = 0;

if (hiringEnabled) {
  for (const i of latestIdx.slice(0, maxChecks)) {
    const r = rows[i];
    checked++;
    let hiring = r.hiring_pm || 'Unknown';
    let titles = r.pm_job_titles || '';
    let urls = r.pm_job_urls || '';
    let careers = r.careers_url || '';
    let website = r.website || '';
    let applyEmail = r.apply_email || '';
    const htmlCache = [];

    // 1) Careers / jobs page (free)
    const careerCands = [];
    if (careers) careerCands.push(careers);
    if (website) {
      const baseUrl = website.replace(/\\/$/, '');
      careerCands.push(\`\${baseUrl}/careers\`, \`\${baseUrl}/jobs\`, \`\${baseUrl}/career\`, \`\${baseUrl}/en/careers\`, \`\${baseUrl}/join\`);
    }
    for (const u of [...new Set(careerCands)].slice(0, 2)) {
      const html = await fetchText.call(this, u);
      if (!html) continue;
      htmlCache.push(html);
      if (careersLooksLive(html)) {
        careers = careers || u;
        hiring = 'Yes';
        careersHits++;
        if (!titles) titles = 'Open roles on careers page';
        break;
      }
    }

    // 2) LinkedIn Guest API (free, no Apify)
    const liUrl = \`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=\${encodeURIComponent(r.company)}&location=Germany&f_TPR=r1209600&start=0\`;
    const liHtml = await fetchText.call(this, liUrl, 6000);
    if (liHtml) {
      const parsed = parseLinkedInGuest(liHtml, r.company);
      if (parsed.titles.length) {
        hiring = 'Yes';
        liHits++;
        titles = parsed.titles.join(' | ');
        urls = parsed.urls.join(' | ');
      } else if (hiring !== 'Yes') {
        hiring = hiring || 'Unknown';
      }
    }

    // 3) Contact / apply email from careers + contact/impressum pages
    if (!applyEmail) {
      for (const html of htmlCache) {
        applyEmail = extractApplyEmail(html);
        if (applyEmail) break;
      }
    }
    if (!applyEmail && website) {
      const base = website.replace(/\\/$/, '');
      for (const u of [\`\${base}/contact\`, \`\${base}/contact-us\`, \`\${base}/impressum\`, \`\${base}/about\`, website]) {
        const html = await fetchText.call(this, u, 4000);
        if (!html) continue;
        applyEmail = extractApplyEmail(html);
        if (applyEmail) break;
      }
    }
    if (applyEmail) emailHits++;

    rows[i] = scoreTargetRow({
      ...r,
      website,
      careers_url: careers,
      apply_email: applyEmail,
      hiring_pm: hiring,
      pm_job_titles: titles,
      pm_job_urls: urls,
      last_hiring_check: today,
    });
  }
}

// Re-score all rows so action fields stay consistent
rows = rows.map(scoreTargetRow);

const latest = latestIdx.map(i => rows[i])
  .sort((a, b) => String(b.funding_date || '').localeCompare(String(a.funding_date || '')));

const applyNow = rows
  .filter(r => !isDoneStatus(r.status) && r.next_action === 'Apply now')
  .sort((a, b) => Number(b.priority_score || 0) - Number(a.priority_score || 0));
const findContact = rows
  .filter(r => !isDoneStatus(r.status) && r.next_action === 'Find contact')
  .sort((a, b) => Number(b.priority_score || 0) - Number(a.priority_score || 0));
const latestOpen = latest.filter(r => !isDoneStatus(r.status));
const doneCount = rows.filter(r => isDoneStatus(r.status)).length;
const hiringYes = latestOpen.filter(r => r.hiring_pm === 'Yes');
const readyToApply = applyNow.length;

function renderActionItem(r) {
  const amount = [r.funding_amount, r.funding_stage, r.funding_date].filter(Boolean).join(' · ');
  const links = [];
  if (r.next_action_url) {
    const label = String(r.next_action_url).startsWith('mailto:') ? 'Email' : 'Open';
    links.push(\`<a href="\${esc(r.next_action_url)}"><b>\${label}</b></a>\`);
  }
  if (r.pm_job_urls) {
    const job0 = firstJobUrl(r);
    if (job0 && job0 !== r.next_action_url) links.push(\`<a href="\${esc(job0)}">Job</a>\`);
  }
  if (r.careers_url && r.careers_url !== r.next_action_url) links.push(\`<a href="\${esc(r.careers_url)}">Careers</a>\`);
  if (r.website && r.website !== r.next_action_url) links.push(\`<a href="\${esc(r.website)}">Website</a>\`);
  if (r.apply_email) links.push(\`<a href="mailto:\${esc(r.apply_email)}">\${esc(r.apply_email)}</a>\`);
  return (
    \`<li style="margin-bottom:12px"><b>\${esc(r.company)}</b> [\${esc(r.priority)} · \${esc(r.priority_score)}]\` +
    \` — \${esc(amount || r.total_raised_note || 'funding update')}\` +
    \`<br><span style="color:#555">\${esc(r.location || 'Germany')}\${r.one_liner ? ' · ' + esc(r.one_liner) : ''}</span>\` +
    (r.pm_job_titles ? \`<br>Roles: \${esc(r.pm_job_titles)}\` : '') +
    (links.length ? \`<br>\${links.join(' · ')}\` : '<br><span style="color:#999">No apply link yet</span>') +
    \`</li>\`
  );
}

const lines = [];
lines.push('<h2>Startup action queue</h2>');
if (prev.sheetUrl) lines.push(\`<p><a href="\${esc(prev.sheetUrl)}">Open sheet</a> — after you act, set <b>status</b> to <b>Applied</b>, <b>Contacted</b>, or <b>Skip</b> so it drops out of the next email.</p>\`);
lines.push(\`<p>Lookback <b>\${lookback}</b> days · Open funding updates: <b>\${latestOpen.length}</b> · Hidden (Applied/Contacted/Skip): <b>\${doneCount}</b> · Checks: <b>\${checked}</b> · Emails found: <b>\${emailHits}</b></p>\`);
lines.push('<p style="color:#666">Do these first. Status in the sheet is sticky across runs.</p>');

lines.push(\`<h3>1) Apply now (\${applyNow.length})</h3>\`);
if (!applyNow.length) {
  lines.push('<p>None this run — no clear job/careers path yet.</p>');
} else {
  lines.push('<ol>');
  for (const r of applyNow.slice(0, 20)) lines.push(renderActionItem(r));
  lines.push('</ol>');
}

lines.push(\`<h3>2) Find contact (\${findContact.length})</h3>\`);
if (!findContact.length) {
  lines.push('<p>None this run.</p>');
} else {
  lines.push('<ol>');
  for (const r of findContact.slice(0, 15)) lines.push(renderActionItem(r));
  lines.push('</ol>');
}

lines.push(\`<h3>3) Latest funding updates (\${latestOpen.length})</h3>\`);
if (!latestOpen.length) {
  lines.push('<p>No open Tech.eu Germany rounds in this window (or all already Applied/Contacted/Skip).</p>');
} else {
  lines.push('<ul>');
  for (const r of latestOpen.slice(0, 25)) {
    const amount = [r.funding_amount, r.funding_stage, r.funding_date].filter(Boolean).join(' · ');
    lines.push(
      \`<li><b>\${esc(r.company)}</b> — \${esc(amount || 'update')} · action: <b>\${esc(r.next_action || 'Watch')}</b></li>\`
    );
  }
  lines.push('</ul>');
}

const digestEmails = String(cfg.digestEmails || cfg.yourEmail || '')
  .split(/[,;]/).map(s => s.trim()).filter(Boolean).join(', ');

return [{
  json: {
    rows,
    digestHtml: lines.join('\\n'),
    companyCount: rows.length,
    newlyAddedCount: latestOpen.length,
    fundingTouched: prev.fundingTouched || 0,
    hiringYes: hiringYes.length,
    applyNow: applyNow.length,
    findContact: findContact.length,
    readyToApply,
    yourEmail: digestEmails,
    sheetUrl: cfg.sheetUrl || prev.sheetUrl || '',
    jobsMatched: hiringYes.length,
    apifyJobs: 0,
    freeChecks: { checked, liHits, careersHits, emailHits },
  }
}];
`;

const PREP = `
const HEADERS = ${JSON.stringify(HEADERS)};

const LEGAL = /\\b(gmbh|ug|ag|se|kg|ohg|gbr|inc|incorporated|ltd|limited|llc|corp|corporation|co|company|holding|holdings|group|sa|bv|nv)\\b/gi;
function normalizeCompanyKey(name) {
  return String(name || '').toLowerCase().normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '').replace(/&/g, ' and ')
    .replace(LEGAL, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\\s+/g, ' ').trim();
}

function pickBetter(a, b) {
  const da = String(a.funding_date || '');
  const db = String(b.funding_date || '');
  if (db && (!da || db > da)) return { ...a, ...b, company: a.company || b.company };
  if (da && (!db || da > db)) return { ...b, ...a, company: a.company || b.company };
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') out[k] = v;
  }
  if ((b.company || '').length > (a.company || '').length) out.company = b.company;
  else out.company = a.company || b.company;
  return out;
}

const items = $('📤 Expand Rows For Sheet').all()
  .filter(i => !i.json._summary && i.json.company)
  .filter(i => {
    const c = String(i.json.company || '').trim().toLowerCase();
    return c && c !== 'company' && c !== 'name';
  });

if (!items.length) return [{ json: { company: '', _empty: true } }];

const byKey = new Map();
for (const item of items) {
  const row = item.json;
  const key = normalizeCompanyKey(row.company);
  if (!key) continue;
  if (!byKey.has(key)) byKey.set(key, { ...row });
  else byKey.set(key, pickBetter(byKey.get(key), row));
}

const rows = [...byKey.values()].sort((a, b) => {
  // Action queue first; done statuses sink to bottom
  const rank = (r) => ({ 'Apply now': 0, 'Find contact': 1, Watch: 2, Contacted: 3, Applied: 4, Skip: 5 }[r.next_action] ?? 6);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  const sa = Number(a.priority_score || 0);
  const sb = Number(b.priority_score || 0);
  if (sb !== sa) return sb - sa;
  const da = String(a.funding_date || '');
  const db = String(b.funding_date || '');
  if (db !== da) return db.localeCompare(da);
  return String(a.company || '').localeCompare(String(b.company || ''));
});

console.log(\`Sheet write: \${items.length} in → \${rows.length} unique, action-queue first\`);

return rows.map(r => {
  const out = {};
  for (const h of HEADERS) out[h] = r[h] ?? '';
  return { json: out };
});
`;

const REEMIT = `
// After clear, re-emit deduped rows from Prep (plus header row)
const HEADERS = ${JSON.stringify(HEADERS)};
const header = Object.fromEntries(HEADERS.map(h => [h, h]));
const rows = $('📋 Prep Sheet Rows').all().filter(i => i.json.company && !i.json._empty);
return [{ json: header }, ...rows.map(i => ({ json: i.json }))];
`;

const EXPAND = `
const summary = $input.first().json;
const rows = summary.rows || [];
if (!rows.length) {
  return [{ json: { ...summary, _empty: true, company: '', _summary: true } }];
}
const out = rows.map(r => ({ json: { ...r, _summary: false } }));
out[0].json._digestHtml = summary.digestHtml;
out[0].json._companyCount = summary.companyCount;
out[0].json._newlyAddedCount = summary.newlyAddedCount;
out[0].json._hiringYes = summary.hiringYes;
out[0].json._applyNow = summary.applyNow;
out[0].json._findContact = summary.findContact;
out[0].json._readyToApply = summary.readyToApply;
out[0].json._yourEmail = summary.yourEmail;
out[0].json._sheetUrl = summary.sheetUrl;
out.push({ json: {
  _summary: true,
  digestHtml: summary.digestHtml,
  companyCount: summary.companyCount,
  newlyAddedCount: summary.newlyAddedCount,
  hiringYes: summary.hiringYes,
  applyNow: summary.applyNow,
  findContact: summary.findContact,
  readyToApply: summary.readyToApply,
  yourEmail: summary.yourEmail,
  sheetUrl: summary.sheetUrl,
  fundingTouched: summary.fundingTouched,
}});
return out;
`;

function schemaForHeaders(headers) {
  return headers.map((id, idx) => ({
    id,
    displayName: id,
    required: false,
    defaultMatch: id === 'company',
    display: true,
    type: 'string',
    canBeUsedToMatch: id === 'company',
  }));
}

const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));

byName['🧠 Merge Enrich Score'].parameters.jsCode = MERGE_ENRICH;
byName['🧠 Free Hiring Check + Digest'].parameters.jsCode = FREE_HIRING;
byName['📋 Prep Sheet Rows'].parameters.jsCode = PREP;
byName['📋 Re-emit Rows After Clear'].parameters.jsCode = REEMIT;
byName['📤 Expand Rows For Sheet'].parameters.jsCode = EXPAND;

const email = byName['📧 Email Digest'];
email.parameters.subject =
  "=🇩🇪 Action queue — {{ $json.applyNow || 0 }} apply · {{ $json.findContact || 0 }} find contact · {{ $now.toFormat('MMM d, yyyy') }}";

const rewrite = byName['📊 Rewrite Target Companies'];
if (rewrite?.parameters?.columns) {
  rewrite.parameters.columns.schema = schemaForHeaders(HEADERS);
  rewrite.parameters.columns.mappingMode = 'autoMapInputData';
}

fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + '\n');
console.log('Patched', wfPath);
console.log('Headers:', HEADERS.length, HEADERS.join(', '));
console.log(
  'Code sizes:',
  ['🧠 Merge Enrich Score', '🧠 Free Hiring Check + Digest', '📋 Prep Sheet Rows'].map(
    (n) => `${n}=${byName[n].parameters.jsCode.length}`,
  ),
);
