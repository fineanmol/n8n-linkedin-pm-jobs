/**
 * Reference helpers for DE Funded Startups → PM Job Targets.
 *
 * Production runtime is the n8n workflow `workflow-startup-targets.json`
 * (Code nodes embed this logic). This module is documentation/reference only.
 */

export const TARGET_HEADERS = [
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

const LEGAL_SUFFIX =
  /\b(gmbh|ug|ag|se|kg|ohg|gbr|inc|incorporated|ltd|limited|llc|corp|corporation|co|company|holding|holdings|group|sa|bv|nv)\b/gi;

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeCompanyKey(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(LEGAL_SUFFIX, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse "€10M Series A" / "$350M Series D" style blobs from the seed sheet. */
export function parseFundingBlob(raw) {
  const s = String(raw || '').trim();
  if (!s) {
    return { funding_stage: '', funding_amount: '', total_raised_note: '' };
  }
  const stageMatch = s.match(
    /\b(pre[-\s]?seed|seed|series\s*[a-f]|series\s*d\+|growth|debt|bridge|extension)\b/i,
  );
  let funding_stage = stageMatch ? stageMatch[1].replace(/\s+/g, ' ') : '';
  if (funding_stage) {
    funding_stage = funding_stage
      .split(' ')
      .map((w) => (w.toLowerCase() === 'series' ? 'Series' : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
      .join(' ')
      .replace(/Series\s*([a-f])/i, (_, l) => `Series ${l.toUpperCase()}`);
  }
  const amountMatch = s.match(/([$€£]\s?[\d.,]+\s?[kmb]?|[\d.,]+\s?[kmb]\s?(?:eur|usd|€|\$)?|mid[-\s]?seven figures)/i);
  return {
    funding_stage,
    funding_amount: amountMatch ? amountMatch[0].replace(/\s+/g, ' ').trim() : s,
    total_raised_note: s,
  };
}

export function formatAmountEur(amountEur, currency, amountNative) {
  if (amountEur == null && amountNative == null) return '';
  if (amountEur != null) {
    if (amountEur >= 1_000_000_000) return `€${(amountEur / 1_000_000_000).toFixed(2)}B`;
    if (amountEur >= 1_000_000) return `€${(amountEur / 1_000_000).toFixed(amountEur >= 10_000_000 ? 0 : 1)}M`;
    if (amountEur >= 1_000) return `€${Math.round(amountEur / 1_000)}k`;
    return `€${amountEur}`;
  }
  if (amountNative != null && currency) {
    return `${currency} ${amountNative}`;
  }
  return '';
}

export function emptyTargetRow(overrides = {}) {
  const row = Object.fromEntries(TARGET_HEADERS.map((h) => [h, '']));
  row.hiring_pm = 'Unknown';
  row.priority = 'Medium';
  row.priority_score = '50';
  row.status = 'Watch';
  row.next_action = 'Watch';
  return { ...row, ...overrides };
}

export function rowFromSeed({ company, location, whatTheyDo, funding }) {
  const parsed = parseFundingBlob(funding);
  return emptyTargetRow({
    company: String(company || '').trim(),
    location: String(location || '').trim(),
    one_liner: String(whatTheyDo || '').trim(),
    funding_stage: parsed.funding_stage,
    funding_amount: parsed.funding_amount,
    total_raised_note: parsed.total_raised_note,
    source: 'seed_sheet',
    last_funded_check: todayIso(),
  });
}

export function rowFromTechEuRound(round) {
  const company = round?.company || {};
  const amount = formatAmountEur(round.amountEur, round.currency, round.amountNative);
  const stage = round.stage || round.rawRoundType || '';
  const note = [amount, stage, round.date].filter(Boolean).join(' · ');
  return emptyTargetRow({
    company: String(company.name || '').trim(),
    location: String(company.city || company.country || '').trim(),
    one_liner: Array.isArray(company.sectors) ? company.sectors.join(', ') : '',
    funding_stage: stage,
    funding_amount: amount,
    funding_date: round.date || '',
    total_raised_note: note,
    source: 'tech.eu',
    last_funded_check: todayIso(),
    notes: round.source?.domain ? `tech.eu via ${round.source.domain}` : 'tech.eu',
  });
}

/**
 * Merge incoming into existing. Never wipe hiring fields on funding-only update.
 */
export function mergeTargetRows(existing, incoming) {
  if (!existing) return { ...incoming };
  const out = { ...existing };
  const fundingFields = [
    'location',
    'one_liner',
    'funding_stage',
    'funding_amount',
    'funding_date',
    'total_raised_note',
  ];
  for (const f of fundingFields) {
    if (incoming[f]) out[f] = incoming[f];
  }
  if (incoming.source && existing.source && incoming.source !== existing.source) {
    out.source = 'both';
  } else if (incoming.source) {
    out.source = existing.source && existing.source !== incoming.source ? 'both' : incoming.source;
  }
  if (incoming.last_funded_check) out.last_funded_check = incoming.last_funded_check;
  if (incoming.notes && !String(existing.notes || '').includes(incoming.notes)) {
    out.notes = [existing.notes, incoming.notes].filter(Boolean).join(' | ').slice(0, 500);
  }
  // Enrich only — never overwrite sticky sheet status / recomputed action fields
  for (const f of [
    'website',
    'linkedin_url',
    'careers_url',
    'apply_email',
    'hiring_pm',
    'pm_job_urls',
    'pm_job_titles',
    'last_hiring_check',
  ]) {
    if (incoming[f] !== undefined && incoming[f] !== '' && incoming[f] != null) {
      out[f] = incoming[f];
    }
  }
  out.status = normalizeStatus(existing.status || out.status || 'Watch');
  return out;
}

function firstJobUrl(row) {
  return String(row.pm_job_urls || '')
    .split(' | ')
    .map((s) => s.trim())
    .filter(Boolean)[0] || '';
}

const DONE_STATUSES = new Set(['Applied', 'Contacted', 'Skip']);

export function normalizeStatus(s) {
  const raw = String(s || '').trim();
  const map = {
    applied: 'Applied',
    contacted: 'Contacted',
    skip: 'Skip',
    skipped: 'Skip',
    watch: 'Watch',
    'ready to apply': 'Ready to Apply',
    ready: 'Ready to Apply',
  };
  return map[raw.toLowerCase()] || raw || 'Watch';
}

export function isDoneStatus(status) {
  return DONE_STATUSES.has(normalizeStatus(status));
}

/** Bucket row into an action queue item. Sheet status Applied/Contacted/Skip is sticky. */
export function assignAction(row) {
  const status = normalizeStatus(row.status);
  if (status === 'Applied') {
    return {
      ...row,
      status,
      next_action: 'Applied',
      next_action_url: firstJobUrl(row) || row.careers_url || row.website || '',
    };
  }
  if (status === 'Contacted') {
    return {
      ...row,
      status,
      next_action: 'Contacted',
      next_action_url: row.apply_email
        ? `mailto:${row.apply_email}`
        : row.careers_url || row.website || '',
    };
  }
  if (status === 'Skip') {
    return { ...row, status, next_action: 'Skip', next_action_url: '' };
  }
  const job0 = firstJobUrl(row);
  if (row.hiring_pm === 'Yes' && (job0 || row.careers_url || row.apply_email)) {
    const next_action_url =
      job0 || row.careers_url || (row.apply_email ? `mailto:${row.apply_email}` : row.website || '');
    return { ...row, status: 'Ready to Apply', next_action: 'Apply now', next_action_url };
  }
  if (
    (row.priority === 'High' || row.priority === 'Medium') &&
    (row.website || row.careers_url || row.apply_email)
  ) {
    const next_action_url = row.apply_email
      ? `mailto:${row.apply_email}`
      : row.careers_url || row.website || '';
    return { ...row, status: status || 'Watch', next_action: 'Find contact', next_action_url };
  }
  return {
    ...row,
    status: status || 'Watch',
    next_action: 'Watch',
    next_action_url: row.careers_url || row.website || '',
  };
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const MAILTO_RE = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
const PREFERRED_LOCAL =
  /^(jobs|careers|talent|people|hr|join|hiring|work|recruiting|bewerbung|karriere)@/i;
const BAD_EMAIL =
  /(noreply|no-reply|donotreply|privacy|legal|newsletter|marketing|sentry\.io|wixpress|example\.com|domain\.com|schema\.org)/i;

/** Best-effort public apply/contact email from HTML. */
export function extractApplyEmail(html) {
  const found = new Set();
  const text = String(html || '');
  for (const m of text.matchAll(MAILTO_RE)) found.add(m[1].toLowerCase());
  for (const m of text.matchAll(EMAIL_RE)) found.add(m[0].toLowerCase());
  const emails = [...found].filter((e) => !BAD_EMAIL.test(e) && e.includes('.') && e.length < 80);
  const preferred = emails.filter((e) => PREFERRED_LOCAL.test(e));
  if (preferred.length) return preferred[0];
  const nonFree = emails.filter((e) => !/@(gmail|googlemail|yahoo|hotmail|outlook|icloud)\./i.test(e));
  return nonFree[0] || emails[0] || '';
}

function locBoost(location) {
  const l = String(location || '').toLowerCase();
  if (/\b(berlin|potsdam)\b/.test(l)) return 25;
  if (/\b(munich|münchen|hamburg|cologne|köln|frankfurt)\b/.test(l)) return 15;
  if (/\bgermany|deutschland\b/.test(l) || l) return 5;
  return 0;
}

function stageBoost(stage) {
  const s = String(stage || '').toLowerCase();
  if (/pre[-\s]?seed|seed/.test(s)) return 20;
  if (/series\s*a/.test(s)) return 18;
  if (/series\s*b/.test(s)) return 12;
  if (/series\s*c/.test(s)) return 4;
  if (/series\s*[def]|growth|d\+/.test(s)) return -8;
  return 6;
}

function englishTitleBoost(titles) {
  const t = String(titles || '');
  if (!t) return 0;
  if (/[äöüß]|\(m\/w\/d\)|\(w\/m\/d\)|\(all genders\)/i.test(t) && !/\bproduct manager\b/i.test(t)) {
    return -5;
  }
  if (/\bproduct (manager|owner)\b/i.test(t)) return 15;
  return 5;
}

/**
 * Job-hunting priority score 0–100.
 */
export function scoreTargetRow(row) {
  let score = 40;
  score += locBoost(row.location);
  score += stageBoost(row.funding_stage);

  const hiring = String(row.hiring_pm || 'Unknown');
  if (hiring === 'Yes') score += 30;
  else if (hiring === 'No') score -= 10;

  score += englishTitleBoost(row.pm_job_titles);
  if (row.apply_email) score += 8;
  if (row.careers_url) score += 4;

  const blurb = `${row.one_liner || ''} ${row.notes || ''}`.toLowerCase();
  if (/\b(hardware|robotics|deeptech|semiconductor|battery|fusion)\b/.test(blurb) && hiring !== 'Yes') {
    score -= 8;
  }
  if (/\b(saas|b2b|ai|software|platform|marketplace)\b/.test(blurb)) score += 6;

  score = Math.max(0, Math.min(100, Math.round(score)));
  let priority = 'Medium';
  if (score >= 70) priority = 'High';
  else if (score < 45) priority = 'Low';

  let status = normalizeStatus(row.status || 'Watch');
  if (!isDoneStatus(status)) {
    if (priority === 'High' && hiring === 'Yes') status = 'Ready to Apply';
    else if (hiring === 'No' && priority === 'Low') status = 'Watch';
  }

  return assignAction({ ...row, priority_score: String(score), priority, status });
}

export function daysSince(isoDate) {
  if (!isoDate) return Infinity;
  const t = Date.parse(isoDate);
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

export function needsHiringRefresh(row, maxAgeDays = 14) {
  return daysSince(row.last_hiring_check) > maxAgeDays;
}

export function needsEnrichment(row) {
  return !row.website || !row.careers_url;
}

/** Fuzzy match job company name against watchlist keys. */
export function matchJobToCompany(jobCompany, keyToCompany) {
  const key = normalizeCompanyKey(jobCompany);
  if (!key) return null;
  if (keyToCompany.has(key)) return keyToCompany.get(key);
  for (const [k, company] of keyToCompany) {
    if (k.includes(key) || key.includes(k)) {
      if (Math.min(k.length, key.length) >= 4) return company;
    }
  }
  return null;
}

export function applyHiringMatches(rows, jobs) {
  const byKey = new Map();
  for (const r of rows) {
    byKey.set(normalizeCompanyKey(r.company), r.company);
  }
  const hits = new Map(); // company -> { titles, urls }
  for (const job of jobs) {
    const title = job.jobTitle || job.title || '';
    if (!/\bproduct\s+(manager|owner|ops|operations|analyst)\b/i.test(title)) continue;
    if (/\b(director|vp|vice president|head of|chief|cpo|intern|werkstudent)\b/i.test(title)) continue;
    const matched = matchJobToCompany(job.companyName || job.company || '', byKey);
    if (!matched) continue;
    const cur = hits.get(matched) || { titles: [], urls: [] };
    if (title && cur.titles.length < 5) cur.titles.push(title);
    const url = job.jobUrl || job.url || '';
    if (url && cur.urls.length < 3) cur.urls.push(url);
    hits.set(matched, cur);
  }

  const today = todayIso();
  return rows.map((r) => {
    const hit = hits.get(r.company);
    if (!hit) return r;
    return {
      ...r,
      hiring_pm: 'Yes',
      pm_job_titles: [...new Set(hit.titles)].join(' | '),
      pm_job_urls: [...new Set(hit.urls)].join(' | '),
      last_hiring_check: today,
    };
  });
}

export function markHiringCheckedNo(rows, companiesChecked) {
  const set = new Set(companiesChecked.map(normalizeCompanyKey));
  const today = todayIso();
  return rows.map((r) => {
    if (!set.has(normalizeCompanyKey(r.company))) return r;
    if (r.hiring_pm === 'Yes') return { ...r, last_hiring_check: today };
    return { ...r, hiring_pm: 'No', last_hiring_check: today };
  });
}

export function slugGuess(company) {
  return normalizeCompanyKey(company).replace(/\s+/g, '');
}

export function guessWebsiteCandidates(company) {
  const slug = slugGuess(company);
  if (!slug || slug.length < 2) return [];
  return [
    `https://www.${slug}.com`,
    `https://${slug}.com`,
    `https://www.${slug}.io`,
    `https://${slug}.io`,
    `https://www.${slug}.de`,
    `https://${slug}.de`,
    `https://www.${slug}.ai`,
    `https://${slug}.ai`,
  ];
}

export function careersCandidates(website) {
  if (!website) return [];
  const base = website.replace(/\/$/, '');
  return [
    `${base}/careers`,
    `${base}/jobs`,
    `${base}/career`,
    `${base}/en/careers`,
    `${base}/en/jobs`,
    `${base}/join`,
    `${base}/join-us`,
  ];
}

export function buildDigest({ rows, newCompanies, hiringYes, sheetUrl }) {
  const applyNow = rows
    .filter((r) => !isDoneStatus(r.status) && r.next_action === 'Apply now')
    .sort((a, b) => Number(b.priority_score || 0) - Number(a.priority_score || 0));
  const findContact = rows
    .filter((r) => !isDoneStatus(r.status) && r.next_action === 'Find contact')
    .sort((a, b) => Number(b.priority_score || 0) - Number(a.priority_score || 0));

  const lines = [];
  lines.push('Startup action queue (weekly)');
  lines.push('');
  if (sheetUrl) {
    lines.push(`Sheet: ${sheetUrl}`);
    lines.push('');
  }
  lines.push(`1) Apply now (${applyNow.length}):`);
  if (!applyNow.length) lines.push('  (none)');
  for (const r of applyNow.slice(0, 20)) {
    lines.push(`  • ${r.company} [${r.priority}] — ${r.pm_job_titles || 'open roles'}`);
    if (r.next_action_url) lines.push(`      ${r.next_action_url}`);
    if (r.apply_email) lines.push(`      ${r.apply_email}`);
  }
  lines.push('');
  lines.push(`2) Find contact (${findContact.length}):`);
  if (!findContact.length) lines.push('  (none)');
  for (const r of findContact.slice(0, 15)) {
    lines.push(`  • ${r.company} [${r.priority}] — ${r.one_liner || r.total_raised_note || ''}`);
    if (r.next_action_url) lines.push(`      ${r.next_action_url}`);
    if (r.apply_email) lines.push(`      ${r.apply_email}`);
  }
  lines.push('');
  lines.push(`Funding updates this run (${newCompanies.length}); hiring matches: ${hiringYes.length}`);
  for (const r of newCompanies.slice(0, 20)) {
    lines.push(
      `  • ${r.company} — ${r.funding_amount || '?'} ${r.funding_stage || ''} · ${r.next_action || 'Watch'}`,
    );
  }
  return lines.join('\n');
}

export function rowsToCsv(rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [TARGET_HEADERS.join(',')];
  for (const r of rows) {
    lines.push(TARGET_HEADERS.map((h) => esc(r[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

export function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = '';
  let row = [];
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((cols) => cols.some(Boolean)).map((cols) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] ?? '';
    });
    return obj;
  });
}
