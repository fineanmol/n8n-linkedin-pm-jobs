#!/usr/bin/env node
/**
 * Tiered truth lexicon for resume/CL ATS weaving.
 *
 * Tier A — Profile / master proven (always OK)
 * Tier B — Mid-level PM baseline (≤5 YOE):
 *   - PM craft skills
 *   - Common PM tools (justifiable for shortlisting)
 *   - Metric *concepts* she already uses (adoption, ROI, …)
 * Tier C — Never invent: languages/fluency, engineering stacks she never used,
 *   senior titles, fake % claims not in master/Profile
 *
 * Metrics rule: weave KPI vocabulary freely; only reuse numeric results that
 * already exist in master/Profile (never invent new percentages).
 *
 * German JD terms map → English candidates, then must pass Tier A|B.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** Standard PM craft for someone with ~3–5 YOE — safe to emphasize. */
export const PM_BASELINE_SKILLS = [
  'Product Manager',
  'Product Owner',
  'Product Strategy',
  'Product Discovery',
  'Product Development',
  'Roadmaps',
  'Roadmap',
  'Backlog',
  'Backlog Prioritization',
  'Prioritization',
  'Agile',
  'Scrum',
  'Kanban',
  'Sprint Planning',
  'Release Planning',
  'Stakeholder Management',
  'Cross-functional',
  'Cross-functional Collaboration',
  'User Stories',
  'Acceptance Criteria',
  'PRDs',
  'Requirements Gathering',
  'Requirement Gathering',
  'User Research',
  'Customer Research',
  'Market Research',
  'Competitive Analysis',
  'Customer Journey Mapping',
  'Experimentation',
  'A/B Testing',
  'KPIs',
  'OKRs',
  'Analytics',
  'Product Analytics',
  'MVP',
  'SDLC',
  'Go-to-Market',
  'GTM',
  'SaaS',
  'B2B',
  'Customer-Centric',
  'User Experience',
  'UX',
  'UI/UX',
  'Data-driven',
  'Roadmap Planning',
  'Feature Prioritization',
  'Product Lifecycle',
  'Stakeholder Communication',
  'Workshop Facilitation',
  'Discovery',
  'Delivery',
];

/**
 * Common PM tools for ≤5 YOE — OK to list for ATS even if not every tool
 * is named in every Profile section. Still interview-justifiable.
 */
export const PM_BASELINE_TOOLS = [
  'JIRA',
  'Jira',
  'Confluence',
  'Miro',
  'Figma',
  'SQL',
  'Power BI',
  'Tableau',
  'Excel',
  'Google Analytics',
  'Optimizely',
  'Amplitude',
  'Mixpanel',
  'Hotjar',
  'Salesforce',
  'HubSpot',
  'CRM',
  'Notion',
  'Trello',
  'Asana',
  'Linear',
  'Slack',
  'GitHub',
  'AWS',
  'Azure',
  'n8n',
  'Looker',
  'Productboard',
  'Aha!',
  'Amplitude Analytics',
];

/**
 * Metric concepts from Profile + standard PM measurement vocabulary.
 * These are concepts / KPI names — NOT invented numeric results.
 */
export const PM_BASELINE_METRICS = [
  'KPIs',
  'OKRs',
  'ROI',
  'Activation',
  'Adoption',
  'Feature Adoption',
  'Engagement',
  'Retention',
  'Conversion Rate',
  'Onboarding Completion',
  'Onboarding Completion Rate',
  'Active Users',
  'NPS',
  'Churn',
  'Customer Satisfaction',
  'Time to Value',
  'Support Ticket Reduction',
  'Revenue Impact',
  'Funnel Analysis',
  'North Star Metric',
  'DAU',
  'MAU',
  'Product Analytics',
];

/**
 * Never invent — even if JD asks.
 * Hard blocks only (languages, deep eng, false seniority, fake domains).
 * Tools/metrics above are intentionally NOT here.
 */
export const NEVER_INVENT = new Set(
  [
    // Languages / fluency
    'german',
    'deutsch',
    'native german',
    'fluent german',
    'c1',
    'c2',
    'b2 german',
    'french',
    'spanish',
    // Deep engineering she does not claim
    'python',
    'java',
    'typescript',
    'javascript',
    'react',
    'kubernetes',
    'docker',
    'terraform',
    'golang',
    'rust',
    'c++',
    // Ecommerce platforms she never claimed
    'magento',
    'shopify',
    // Seniority / false claims
    'director',
    'head of product',
    'vp product',
    '10+ years',
    '8+ years',
    '7+ years',
    '6+ years',
    // Domains she didn't claim as deep expertise
    'blockchain',
    'quantum',
    'hardware',
    'embedded',
  ].map((s) => s.toLowerCase()),
);

/**
 * German PM phrases → English skill candidates (ordered by preference).
 * Filler like Erfahrung/oder is intentionally absent.
 */
export const DE_TO_EN_SKILLS = [
  [/cross[- ]funktion|schnittstellen[- ]arbeit|übergreifend(e|en)?\s+zusammenarbeit/i, [
    'Cross-functional',
  ]],
  [/\bstakeholder(n|s| management| managements)?\b/i, ['Stakeholder Management']],
  [/\bagile\b|\bagilen?\s+(method|arbeit|vorgehen|framework)/i, ['Agile']],
  [/\bscrum\b/i, ['Scrum']],
  [/\bkanban\b/i, ['Kanban']],
  [/\bbacklog\b/i, ['Backlog']],
  [/priorisierung|priorisieren|backlog priorit/i, ['Backlog Prioritization', 'Prioritization']],
  [/produktstrategie|product strategy/i, ['Product Strategy']],
  [/\bproduktroadmap\b|\broadmap\b/i, ['Roadmaps']],
  [/requirement gathering|anforderungserhebung|requirements engineering|anforderungsmanagement/i, [
    'Requirement Gathering',
  ]],
  [/lastenheft|pflichtenheft|\bprds?\b|product requirements? document/i, ['PRDs']],
  [/user stor(y|ies)|nutzerhistor/i, ['User Stories']],
  [/akzeptanzkriter|acceptance criteria/i, ['Acceptance Criteria']],
  [/release planning|release plan|release management|go[- ]live planung/i, ['Release Planning']],
  [/sprint planning|sprintplanung/i, ['Sprint Planning']],
  [/marktanalys|marktforschung|competitive analysis|wettbewerbsanalys/i, [
    'Market Research',
    'Competitive Analysis',
  ]],
  [/nutzerforschung|user research|kundeninterview/i, ['User Research', 'Customer Research']],
  [/kundenreise|customer journey|journey map/i, ['Customer Journey Mapping']],
  [/\bkpis?\b|\bkennzahl(en)?\b|\bokrs?\b/i, ['KPIs', 'OKRs']],
  [/a\/?b[- ]?test|experimentation|hypothesen[- ]?test/i, ['A/B Testing', 'Experimentation']],
  [/product analytics|produktanalytik|\banalytics\b|datenanalyse/i, ['Analytics', 'Product Analytics']],
  [/\bsaas\b/i, ['SaaS']],
  [/\bb2b\b/i, ['B2B']],
  [/\bmvp\b|minimum viable product/i, ['MVP']],
  [/user experience|\bux\b|nutzererfahrung/i, ['User Experience', 'UX']],
  [/\bfigma\b/i, ['Figma']],
  [/\bjira\b/i, ['JIRA']],
  [/\bconfluence\b/i, ['Confluence']],
  [/\bsql\b/i, ['SQL']],
  [/\bsalesforce\b/i, ['Salesforce']],
  [/\bhubspot\b/i, ['HubSpot']],
  [/\bcrm\b/i, ['CRM']],
  [/go[- ]to[- ]market|\bgtm\b|markteinführung/i, ['GTM', 'Go-to-Market']],
  [/product owner|produkteigentümer/i, ['Product Owner']],
  [/product manager|produktmanager/i, ['Product Manager']],
  [/product discovery|produktentdeckung/i, ['Product Discovery']],
  [/\bamplitude\b/i, ['Amplitude']],
  [/\bmixpanel\b/i, ['Mixpanel']],
  [/power\s*bi/i, ['Power BI']],
  [/\btableau\b/i, ['Tableau']],
  [/\blooker\b/i, ['Looker']],
  [/google analytics|\bga4\b/i, ['Google Analytics']],
  [/\boptimizely\b/i, ['Optimizely']],
  [/\bnotion\b/i, ['Notion']],
  [/\bproductboard\b/i, ['Productboard']],
  [/\baws\b|amazon web services/i, ['AWS']],
  [/\bazure\b|microsoft azure/i, ['Azure']],
  [/feature[- ]adoption|\badoption rate\b|nutzungsrate/i, ['Adoption', 'Feature Adoption']],
  [/activation rate|aktivierungsrate/i, ['Activation']],
  [/\bretention\b|\bchurn\b/i, ['Retention', 'Churn']],
  [/conversion rate|konversionsrate|\bfunnel\b/i, ['Conversion Rate', 'Funnel Analysis']],
  [/\bnps\b|kundenzufriedenheit|customer satisfaction/i, ['NPS', 'Customer Satisfaction']],
  [/\broi\b|revenue impact|geschäftswirkung/i, ['ROI', 'Revenue Impact']],
  [/\bdau\b|\bmau\b|active users/i, ['Active Users', 'Engagement']],
];

/** Pull must-have / requirements slices from a JD for stronger matching weight. */
export function extractJdRequirementSections(jd) {
  const text = String(jd || '');
  if (!text.trim()) return '';
  const chunks = [];
  const patterns = [
    /(?:must[- ]haves?|requirements?|qualifications?|your profile|what you bring|anforderungen|anforderungsprofil|dein profil|ihr profil|das bringst du|das erwartet wir|hard skills|tools?(?:\s+&\s*|\s+and\s+)?technologies)[:\s]*([\s\S]{80,2500}?)(?=\n\s*(?:nice to have|optional|benefits|what we offer|wir bieten|über uns|about us|aufgaben|your tasks)\b|$)/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) {
      if (m[1]) chunks.push(m[1]);
    }
  }
  // Also take bullet-heavy middle if no labeled section matched
  if (!chunks.length) {
    const lines = text.split('\n').filter((l) => /^\s*[-•*]|\d+\./.test(l));
    if (lines.length >= 4) chunks.push(lines.join('\n'));
  }
  return chunks.join('\n\n');
}

export function normalizeSkill(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[()]/g, '');
}

function extractSkillsFromProfileMd(text) {
  const out = new Set();
  const lines = String(text || '').split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*[-*]\s+(.+)$/);
    if (!m) continue;
    const item = m[1].replace(/[*_`]/g, '').trim();
    if (item.length < 2 || item.length > 60) continue;
    if (/^(when |i |looking |more |building )/i.test(item)) continue;
    out.add(item);
  }
  // Also pull common skill / tool / metric phrases from prose
  for (const phrase of [...PM_BASELINE_SKILLS, ...PM_BASELINE_TOOLS, ...PM_BASELINE_METRICS]) {
    if (text.toLowerCase().includes(normalizeSkill(phrase))) out.add(phrase);
  }
  return out;
}

/** Numeric results already in master/Profile — only these % claims may be reused. */
export function extractProvenMetricClaims(master, profileText = '') {
  const blob = [
    profileText,
    master?.resumeSummary || '',
    ...(master?.resumeExperience || []).map((j) => j.bullets || ''),
  ].join('\n');
  const claims = [];
  // e.g. 28%, 20% increase in revenue, 11+ new features
  const re =
    /(\d+(?:\.\d+)?%\s*(?:increase|reduction|improvement|growth)?[^.!\n]{0,60}|\d+\+?\s*(?:new\s+)?features?[^.!\n]{0,40})/gi;
  let m;
  while ((m = re.exec(blob))) {
    const claim = m[1].replace(/\*\*/g, '').trim();
    if (claim && !claims.some((c) => c.toLowerCase() === claim.toLowerCase())) {
      claims.push(claim);
    }
  }
  return claims.slice(0, 8);
}

function extractFromMasterResume(master) {
  const out = new Set();
  for (const s of String(master?.resumeSkills || '').split(',')) {
    const t = s.trim();
    if (t) out.add(t);
  }
  const blob = [
    master?.resumeSummary || '',
    ...(master?.resumeExperience || []).map((j) => j.bullets || ''),
    ...(master?.resumeCerts || []).map((c) => `${c.title || ''} ${c.desc || ''}`),
  ].join('\n');
  for (const phrase of [
    ...PM_BASELINE_SKILLS,
    ...PM_BASELINE_TOOLS,
    ...PM_BASELINE_METRICS,
    'Salesforce',
    'HubSpot',
    'AI',
    'ML',
  ]) {
    if (blob.toLowerCase().includes(normalizeSkill(phrase))) out.add(phrase);
  }
  return out;
}

let _cache = null;

/**
 * Build / return the truth lexicon.
 * @returns {{ proven: Set<string>, baseline: Set<string>, never: Set<string>, byNorm: Map<string,string> }}
 */
export function loadTruthLexicon({ profilePath, masterResume } = {}) {
  if (_cache && !profilePath && !masterResume) return _cache;

  const pPath = profilePath || path.join(ROOT, 'Profile/Profile.md');
  let profileText = '';
  try {
    profileText = readFileSync(pPath, 'utf8');
  } catch {
    profileText = '';
  }

  let master = masterResume;
  if (!master) {
    try {
      master = JSON.parse(
        readFileSync(path.join(ROOT, 'applications/master/sakshi-resume.json'), 'utf8'),
      );
    } catch {
      master = {};
    }
  }

  const proven = new Set([
    ...extractSkillsFromProfileMd(profileText),
    ...extractFromMasterResume(master),
  ]);
  const baseline = new Set([
    ...PM_BASELINE_SKILLS,
    ...PM_BASELINE_TOOLS,
    ...PM_BASELINE_METRICS,
  ]);
  const never = NEVER_INVENT;
  const provenMetrics = extractProvenMetricClaims(master, profileText);
  const toolNorms = new Set(PM_BASELINE_TOOLS.map(normalizeSkill));
  const metricNorms = new Set(PM_BASELINE_METRICS.map(normalizeSkill));

  // Canonical label by normalized key (prefer proven spelling, then baseline)
  const byNorm = new Map();
  for (const label of [...baseline, ...proven]) {
    const n = normalizeSkill(label);
    if (!byNorm.has(n)) byNorm.set(n, label);
  }
  // Prefer proven labels when both exist
  for (const label of proven) {
    byNorm.set(normalizeSkill(label), label);
  }

  const lex = {
    proven,
    baseline,
    never,
    byNorm,
    profileText,
    master,
    provenMetrics,
    toolNorms,
    metricNorms,
  };
  if (!profilePath && !masterResume) _cache = lex;
  return lex;
}

function classifyLabel(label, lexicon) {
  const n = normalizeSkill(label);
  if (lexicon.toolNorms?.has(n) || [...(lexicon.toolNorms || [])].some((t) => n.includes(t) || t.includes(n))) {
    return 'tool';
  }
  if (lexicon.metricNorms?.has(n) || [...(lexicon.metricNorms || [])].some((t) => n.includes(t) || t.includes(n))) {
    return 'metric';
  }
  return 'skill';
}

/**
 * Resolve a raw JD token / phrase to an allowed English skill label, or null.
 * @returns {{ label: string, tier: 'proven'|'baseline', source: string } | null}
 */
export function resolveTruthSkill(raw, lexicon = loadTruthLexicon()) {
  const n = normalizeSkill(raw);
  if (!n || n.length < 2) return null;
  if (lexicon.never.has(n)) return null;
  // Block German-only leftovers
  if (/[äöüß]/.test(n)) return null;
  if (/^(und|oder|der|die|das|mit|von|für|eine|einer|nicht|sich|wir|erfahrung|kenntnisse|aufgaben|anforderungen)$/.test(n)) {
    return null;
  }

  // Exact / contains match against known labels
  for (const [norm, label] of lexicon.byNorm) {
    if (norm === n || norm.includes(n) || n.includes(norm)) {
      if (lexicon.never.has(norm)) return null;
      const tier = [...lexicon.proven].some((p) => normalizeSkill(p) === normalizeSkill(label))
        ? 'proven'
        : 'baseline';
      // Must be in proven OR baseline
      const inBaseline = [...lexicon.baseline].some((b) => normalizeSkill(b) === normalizeSkill(label));
      const inProven = tier === 'proven';
      if (!inProven && !inBaseline) continue;
      return { label, tier: inProven ? 'proven' : 'baseline', source: 'lexicon' };
    }
  }
  return null;
}

/**
 * Extract allowlisted English skills from a JD (EN or DE), truth-filtered.
 * Thorough: full JD + dedicated requirements/profile sections (weighted later).
 */
export function extractTruthSkillsFromJd(jd, lexicon = loadTruthLexicon()) {
  const text = String(jd || '');
  const reqText = extractJdRequirementSections(text);
  const found = [];
  const seen = new Set();

  const push = (label, tier, source, inRequirements = false) => {
    const n = normalizeSkill(label);
    if (!n || seen.has(n)) {
      // Upgrade existing hit if later found in requirements section
      if (n && seen.has(n) && inRequirements) {
        const prev = found.find((f) => normalizeSkill(f.label) === n);
        if (prev) prev.inRequirements = true;
      }
      return;
    }
    if (lexicon.never.has(n)) return;
    seen.add(n);
    found.push({ label, tier, source, inRequirements: !!inRequirements });
  };

  const scanChunk = (chunk, sourcePrefix, inRequirements) => {
    if (!chunk) return;
    for (const [re, candidates] of DE_TO_EN_SKILLS) {
      if (!re.test(chunk)) continue;
      for (const c of candidates) {
        const hit = resolveTruthSkill(c, lexicon);
        if (hit) push(hit.label, hit.tier, `${sourcePrefix}-map`, inRequirements);
      }
    }
    const lower = chunk.toLowerCase();
    for (const label of lexicon.byNorm.values()) {
      const n = normalizeSkill(label);
      if (n.length < 3) continue;
      // Word-boundary style match — avoid "ai" inside "said", "sql" inside random tokens
      const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s/-]+');
      const re = new RegExp(`(?:^|[^a-z0-9])${escaped}(?=[^a-z0-9]|$)`, 'i');
      if (re.test(lower)) {
        const hit = resolveTruthSkill(label, lexicon);
        if (hit) push(hit.label, hit.tier, `${sourcePrefix}-scan`, inRequirements);
      }
    }
  };

  // 1) Full JD
  scanChunk(text, 'jd', false);
  // 2) Requirements / profile sections again (marks inRequirements for ranking)
  scanChunk(reqText, 'req', true);

  return found;
}

/** Soft / vague terms that inflate JD skill counts but hurt real ATS signal. */
const LOW_SIGNAL_SKILLS = new Set(
  [
    'ownership',
    'continuous learning',
    'innovation',
    'reporting',
    'delivery',
    'strong',
    'excellent',
    'communication',
    'teamwork',
    'passion',
    'motivated',
    'proactive',
    'economics',
    'constructive feedback',
    'onboarding completion',
    'validate assumptions',
    'customer feedback analysis',
  ].map(normalizeSkill),
);

/**
 * Cap + rank JD truth skills for scoring/weaving.
 * Rank by what the JD actually asks for (requirements section, frequency, tools) —
 * NOT by what is already on the master (that inflated every pack to ~100).
 * Master ownership only excludes never-invent cloud stacks from the score set.
 */
export function selectScorableTruthSkills(
  truthSkills,
  { masterResume = null, max = 18, jdText = '', lexicon = loadTruthLexicon() } = {},
) {
  const masterBlob = [
    masterResume?.resumeSkills || '',
    masterResume?.resumeSummary || '',
    ...(masterResume?.resumeExperience || []).map((j) => j?.bullets || ''),
  ]
    .join('\n')
    .toLowerCase();

  const jdLower = String(jdText || '').toLowerCase();
  const reqLower = extractJdRequirementSections(jdText).toLowerCase();

  const rank = (item) => {
    const label = typeof item === 'string' ? item : item.label;
    const n = normalizeSkill(label);
    if (!n || LOW_SIGNAL_SKILLS.has(n)) return -100;

    // Role titles are context, not skill keywords for ATS %
    if (/^(product manager|product owner|product lead)$/i.test(n)) return -20;

    // Unowned cloud/platform: do not score (and do not force onto resume)
    if (
      /^(aws|azure|gcp|kubernetes|kafka|terraform)$/i.test(n) &&
      !(masterBlob && blobHasSkill(masterBlob, label))
    ) {
      return -50;
    }

    let score = 5;
    // JD requirements / profile section = strongest signal
    if (item?.inRequirements || (reqLower && blobHasSkill(reqLower, label))) score += 35;
    // Explicit tools named in JD beat generic craft fluff
    if (classifyLabel(label, lexicon) === 'tool') score += 20;
    // Frequency + early mention in full JD
    if (jdLower) {
      const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s/-]+');
      const re = new RegExp(escaped, 'gi');
      const hits = (jdLower.match(re) || []).length;
      score += Math.min(hits * 6, 24);
      const idx = jdLower.search(re);
      if (idx >= 0 && idx < 600) score += 10;
    }
    // Specific multi-word craft > single vague tokens
    if (n.includes(' ')) score += 6;
    return score;
  };

  return [...truthSkills]
    .map((item) => ({ item, score: rank(item) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.item);
}

/** Display form inside a sentence: keep acronyms/tools, else lowercase phrase. */
function skillInSentence(label) {
  const L = String(label || '').trim();
  if (!L) return L;
  const known = {
    sql: 'SQL',
    kpi: 'KPIs',
    kpis: 'KPIs',
    okr: 'OKRs',
    okrs: 'OKRs',
    api: 'API',
    jira: 'JIRA',
    aws: 'AWS',
    sap: 'SAP',
    ml: 'ML',
    ai: 'AI',
    gtm: 'GTM',
    'a/b testing': 'A/B testing',
    'power bi': 'Power BI',
    'ui/ux': 'UI/UX',
    prds: 'PRDs',
    etl: 'ETL',
  };
  const n = L.toLowerCase();
  if (known[n]) return known[n];
  if (/^[A-Z0-9][A-Z0-9+.#/-]{1,10}$/.test(L)) return L;
  return n; // "user research", "stakeholder management"
}

/**
 * Build a natural English clause for a JD skill — never bare "(Keyword)" dumps.
 * Returns null if we can't form a sensible phrase for this bullet/context.
 */
export function naturalSkillClause(label, kind, hostText = '') {
  const L = String(label || '').trim();
  if (!L) return null;
  const host = String(hostText || '');
  const hostLower = host.toLowerCase();
  if (blobHasSkill(hostLower, L)) return null;
  const s = skillInSentence(L);

  if (kind === 'tool') {
    if (/\b(using|via|in)\s+[A-Za-z]/i.test(host) && host.length > 120) return null;
    return `using ${L}`;
  }
  if (kind === 'metric') {
    return `tracking ${s}`;
  }
  // Craft / domain skills — prefer mid-sentence fits
  if (/stakeholder/i.test(L) && /stakeholder/i.test(host)) return null;
  if (/roadmap/i.test(L) && /roadmap/i.test(host)) return null;
  if (/backlog|priorit/i.test(L) && /backlog|priorit/i.test(host)) return null;
  if (/\b(skills?|leadership|problem-solving|communication)\b/i.test(host)) {
    return `including ${s}`;
  }
  if (/analytics|sql|data/i.test(L) && /data-driven|analytics|sql/i.test(host)) {
    return `with ${s}`;
  }
  if (/\b(features?|backlog|roadmap|delivery|requirements?|release|prd|user stor)/i.test(host)) {
    return `with a clear focus on ${s}`;
  }
  if (/\b(collaborat|partner|cross[- ]functional)/i.test(host)) {
    return `around ${s}`;
  }
  return `with emphasis on ${s}`;
}

/**
 * Rewrite one experience/achievement sentence so a JD skill fits grammatically.
 * Keeps original meaning; returns original if rewrite would be awkward or too long.
 */
export function weaveSkillIntoSentence(text, label, kind, { maxLen = 230 } = {}) {
  const raw = String(text || '').trim();
  if (!raw || !label) return raw;
  if (blobHasSkill(raw.toLowerCase(), label)) return raw;

  const clause = naturalSkillClause(label, kind, raw);
  if (!clause) return raw;
  const s = skillInSentence(label);

  let out = raw;

  // Prefer integrating before the final period as a participial / prepositional phrase
  if (kind === 'tool' && /\b(collaborat|work(?:ed|ing)? with|partner)/i.test(raw)) {
    out = raw.replace(/\.\s*$/, '') + `, ${clause} for planning and delivery.`;
  } else if (kind === 'metric' && /\b(improv|increas|reduc|driv|deliver|maxim|accelerat)/i.test(raw)) {
    out = raw.replace(/\.\s*$/, '') + ` while ${clause}.`;
  } else if (
    // Single-token tools/metrics only — never "product strategy-aligned product features"
    !/\s/.test(s) &&
    /\bdata-driven product (decisions|improvements|features)\b/i.test(raw)
  ) {
    out = raw.replace(
      /\bdata-driven product (decisions|improvements|features)\b/i,
      `${s}-informed product $1`,
    );
  } else if (
    !/\s/.test(s) &&
    /\bdata-driven\b/i.test(raw) &&
    /analytics|sql|kpi|experiment|research/i.test(label)
  ) {
    out = raw.replace(/\bdata-driven\b/i, `${s}-informed`);
  } else if (!/\s/.test(s) && /\bproduct (decisions|improvements|features)\b/i.test(raw)) {
    out = raw.replace(
      /\bproduct (decisions|improvements|features)\b/i,
      `${s}-aligned product $1`,
    );
  } else {
    const base = raw.replace(/\.\s*$/, '');
    out = `${base}, ${clause}.`;
  }

  out = out
    .replace(/\s+/g, ' ')
    .replace(/\.\./g, '.')
    .replace(/,\s*,/g, ',')
    .replace(/\s+([.,])/g, '$1')
    .trim();

  // Reject awkward or oversized rewrites — keep original
  // (Sentence-level **bold** is applied later in highlightJdKeywordsInDocs.)
  if (out.length > maxLen) return raw;
  if (/\(\s*[A-Za-z][^)]{0,40}\)\s*\(/i.test(out)) return raw;
  if (/with (a clear )?focus on with/i.test(out)) return raw;
  if (/informed-informed|aligned-aligned/i.test(out)) return raw;
  // Multi-word craft jammed as hyphen prefix reads broken
  if (/\b[\w]+(?:\s+[\w]+){1,4}-(?:informed|aligned)\b/i.test(out)) return raw;
  if (/(?:informed|aligned)-(?:informed|aligned)/i.test(out)) return raw;
  return out;
}

/**
 * Humanized weave: skills chips + summary/CL + experience + achievements (no spam).
 * Third-party ATS mostly ignore skills chips — body text must carry JD terms.
 * Any edit must read as a normal English sentence.
 * Tools + metric concepts OK; numeric claims only from provenMetrics.
 */
/** Low-signal chips we can drop to make room for required JD PM craft. */
const SWAPPABLE_SKILL_NORMS = new Set(
  [
    'ownership',
    'delivery',
    'innovation',
    'reporting',
    'continuous learning',
    'constructive feedback',
    'onboarding completion',
    'activation',
    'active users',
    'dau',
    'churn',
    'retention',
  ].map(normalizeSkill),
);

export function humanizeWeave(
  resume,
  coverLetter,
  missingLabels,
  {
    maxFamiliar = 2,
    maxBulletWeaves = 3,
    maxAchievementWeaves = 2,
    lexicon = loadTruthLexicon(),
    jdThemes = [],
    prioritizeBodyLabels = [],
    /** Skills chips only — no summary/bullet/CL rewrites (preserves master layout). */
    skillsOnly = false,
    /** Keep master summary text; still allow bullet skill mentions. */
    preserveSummary = false,
    /** Do not append JD clauses to cover letter paragraphs. */
    preserveCoverLetter = false,
  } = {},
) {
  const r = structuredClone(resume);
  const c = structuredClone(coverLetter);
  const skills = (r.resumeSkills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const added = [];
  const addedTools = [];
  const addedMetrics = [];
  for (const label of missingLabels.slice(0, 14)) {
    if (!skills.some((s) => normalizeSkill(s) === normalizeSkill(label))) {
      skills.push(label);
      added.push(label);
      const kind = classifyLabel(label, lexicon);
      if (kind === 'tool') addedTools.push(label);
      else if (kind === 'metric') addedMetrics.push(label);
    }
  }

  // Cap skills list growth (room for tools + metrics)
  r.resumeSkills = skills.slice(0, 48).join(', ');

  // Skills-only: swap/add chips for JD gaps, leave summary/bullets/CL untouched
  if (skillsOnly) {
    const priority = (prioritizeBodyLabels || [])
      .map((l) => String(l || '').trim())
      .filter(Boolean);
    const want = [];
    for (const l of [...priority, ...missingLabels, ...jdThemes]) {
      const label = typeof l === 'string' ? l : l?.label;
      if (!label) continue;
      if (!want.some((u) => normalizeSkill(u) === normalizeSkill(label))) want.push(label);
    }
    for (const label of want.slice(0, 10)) {
      if (skills.some((s) => normalizeSkill(s) === normalizeSkill(label))) continue;
      const swapAt = skills.findIndex((s) => SWAPPABLE_SKILL_NORMS.has(normalizeSkill(s)));
      if (swapAt >= 0) {
        skills[swapAt] = label;
        if (!added.includes(label)) added.push(label);
      } else if (skills.length < 48) {
        skills.push(label);
        if (!added.includes(label)) added.push(label);
      }
    }
    r.resumeSkills = skills.slice(0, 48).join(', ');
    return { resume: r, coverLetter: c, added, addedTools, addedMetrics };
  }

  // Keep under designer 1-page summary cap (resume-cv-mvp MASTER_SUMMARY_MAX_CHARS).
  const SUMMARY_MAX = 430;
  const capAtSentence = (text, max = SUMMARY_MAX) => {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const slice = t.slice(0, max);
    const sentence = slice.match(/^[\s\S]*[.!?]/)?.[0]?.trim();
    if (sentence && sentence.length >= Math.floor(max * 0.7)) return sentence;
    return slice.replace(/\s+\S*$/, '').trim().replace(/[,:;]$/, '') + '.';
  };

  const themeLabels = [
    ...jdThemes,
    ...added,
    ...missingLabels,
  ]
    .map((x) => (typeof x === 'string' ? x : x?.label))
    .filter(Boolean)
    .filter((l) => !/^(Product Manager|Product Owner|Product Lead)$/i.test(l));
  const uniqueThemes = [];
  for (const t of themeLabels) {
    if (!uniqueThemes.some((u) => normalizeSkill(u) === normalizeSkill(t))) {
      uniqueThemes.push(t);
    }
  }

  // Enrich summary with JD themes — skipped when preserveSummary (keep master wording).
  let summary = r.resumeSummary || '';
  if (!preserveSummary) {
    const focusBits = uniqueThemes
      .filter((l) => !summary.toLowerCase().includes(String(l).toLowerCase()))
      .slice(0, 3);
    if (focusBits.length >= 2 && summary.length < SUMMARY_MAX - 40) {
      const focusStr = focusBits.slice(0, 3).join(', ');
      const looksGeneric =
        /Results-driven Product Manager|managing B2B product lifecycles|identifying market potential/i.test(
          summary,
        ) || summary.length < 200;
      if (looksGeneric) {
        summary = `Product Manager with 3.5+ years owning B2B discovery-to-delivery work across ${focusStr}. Partner with engineering, design, sales, and ops on backlog prioritization, release planning, and stakeholder alignment. Data-minded (SQL / Power BI) with shipped outcomes including 28% faster delivery and measurable revenue impact.`;
      } else {
        const inject = ` Focus areas include ${focusStr}.`;
        if (!/Focus areas include/i.test(summary) && summary.length + inject.length <= SUMMARY_MAX) {
          summary = `${summary.replace(/\s+$/, '')}${inject}`;
        }
      }
      summary = summary.replace(/\s+/g, ' ').trim();
    }
    const familiarCount =
      (summary.match(/\bFamiliar with\b/gi) || []).length +
      (summary.match(/\bComfortable with\b/gi) || []).length;
    const toMention = added
      .filter((l) => !summary.toLowerCase().includes(l.toLowerCase()))
      .slice(0, maxFamiliar);

    const proven = lexicon.provenMetrics || [];
    if (addedMetrics.length && proven.length && !/\d+%/.test(summary)) {
      const claim = (proven.find((p) => /\d+%/.test(p)) || proven[0] || '')
        .replace(/\*\*/g, '')
        .trim();
      if (claim && claim.length < 60) {
        const withMetric = `${summary.replace(/\s+$/, '')} Track record: ${claim}.`.replace(/\.\./g, '.');
        if (withMetric.length <= SUMMARY_MAX) summary = withMetric;
      }
    }

    if (toMention.length && familiarCount < maxFamiliar && summary.length <= SUMMARY_MAX - 55) {
      const kind = classifyLabel(toMention[0], lexicon);
      let phrase;
      if (kind === 'tool') {
        phrase = ` Day-to-day toolkit includes ${toMention[0]}.`;
      } else if (kind === 'metric') {
        phrase = ` Track ${toMention[0]} alongside product KPIs.`;
      } else {
        phrase = ` Strong in ${toMention.slice(0, 2).join(' and ')} for day-to-day product work.`;
      }
      const next = `${summary.replace(/\s+$/, '')}${phrase}`.replace(/\.\./g, '.');
      if (next.length <= SUMMARY_MAX) summary = next;
    }

    for (const marker of ['Familiar with', 'Comfortable with']) {
      const re = new RegExp(`(?=\\b${marker}\\b)`, 'i');
      const parts = summary.split(re);
      if (parts.length > 2) {
        summary = (parts[0] + parts[1]).replace(/\s+/g, ' ').trim();
      }
    }
    r.resumeSummary = capAtSentence(summary, SUMMARY_MAX);
  }

  // Experience + achievements: natural sentence rewrites (must read as real English).
  const bodyBlob = [
    r.resumeSummary,
    ...(r.resumeExperience || []).map((j) => j?.bullets || ''),
    ...(r.resumeAchievements || []).map((a) => `${a?.title || ''} ${a?.desc || ''}`),
    ...(r.resumeCerts || []).map((a) => `${a?.title || ''} ${a?.desc || ''}`),
    c.p2 || '',
    c.p3 || '',
  ]
    .join('\n')
    .toLowerCase();

  // Core PM craft first (Product Strategy, Requirement Gathering, …), then other gaps
  const priority = (prioritizeBodyLabels || [])
    .map((l) => String(l || '').trim())
    .filter(Boolean);
  const needBodyRaw = [...priority, ...added, ...uniqueThemes, ...missingLabels].filter(
    (l) => l && !blobHasSkill(bodyBlob, l),
  );
  const needBody = [];
  for (const l of needBodyRaw) {
    if (!needBody.some((u) => normalizeSkill(u) === normalizeSkill(l))) needBody.push(l);
    if (needBody.length >= maxBulletWeaves) break;
  }

  // Swap low-signal skills chips for required body PM labels (keep list useful for ATS + truth)
  for (const label of needBody) {
    if (skills.some((s) => normalizeSkill(s) === normalizeSkill(label))) continue;
    const swapAt = skills.findIndex((s) => SWAPPABLE_SKILL_NORMS.has(normalizeSkill(s)));
    if (swapAt >= 0) {
      skills[swapAt] = label;
      if (!added.includes(label)) added.push(label);
    } else if (skills.length < 48) {
      skills.push(label);
      if (!added.includes(label)) added.push(label);
    }
  }
  r.resumeSkills = skills.slice(0, 48).join(', ');

  // Summary: swap a generic clause for missing core PM labels (not append spam)
  if (!preserveSummary) {
    const summaryNeed = needBody.filter((l) =>
      /product strategy|requirement gathering|backlog prioritization|stakeholder management|roadmaps|user stories|release planning/i.test(
        l,
      ),
    );
    if (summaryNeed.length && r.resumeSummary) {
      let sum = String(r.resumeSummary);
      for (const label of summaryNeed.slice(0, 2)) {
        if (blobHasSkill(sum.toLowerCase(), label)) continue;
        const s = skillInSentence(label);
        const swapped = sum
          .replace(
            /\bdata-driven product (decisions|improvements|features)\b/i,
            `${s}-aligned product $1`,
          )
          .replace(
            /\bbacklog prioritization, release planning, and stakeholder alignment\b/i,
            `${s}, backlog prioritization, and stakeholder alignment`,
          )
          .replace(
            /\bdiscovery-to-delivery work\b/i,
            `discovery-to-delivery work with emphasis on ${s}`,
          );
        if (swapped !== sum && swapped.length <= SUMMARY_MAX) {
          sum = swapped;
          continue;
        }
        const inject = ` Hands-on with ${s} across discovery and delivery.`;
        if (sum.length + inject.length <= SUMMARY_MAX && !blobHasSkill(sum.toLowerCase(), label)) {
          sum = `${sum.replace(/\s+$/, '')}${inject}`;
        }
      }
      r.resumeSummary = capAtSentence(sum, SUMMARY_MAX);
    }
  }

  let weaveIdx = 0;
  if (needBody.length && Array.isArray(r.resumeExperience)) {
    for (let ji = 0; ji < r.resumeExperience.length && weaveIdx < needBody.length; ji++) {
      const job = r.resumeExperience[ji];
      const lines = String(job?.bullets || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      for (let li = 0; li < lines.length && weaveIdx < needBody.length; li++) {
        const label = needBody[weaveIdx];
        if (!label) break;
        const kind = classifyLabel(label, lexicon);
        const next = weaveSkillIntoSentence(lines[li], label, kind, { maxLen: 210 });
        if (next !== lines[li]) {
          lines[li] = next;
          weaveIdx++;
        }
      }
      r.resumeExperience[ji] = { ...job, bullets: lines.join('\n') };
    }
  }

  // Achievements: only when the theme fits the achievement meaning (no forced cloud tools).
  if (Array.isArray(r.resumeAchievements) && weaveIdx < needBody.length) {
    let achWeaves = 0;
    r.resumeAchievements = r.resumeAchievements.map((ach) => {
      if (achWeaves >= maxAchievementWeaves || weaveIdx >= needBody.length) return ach;
      const label = needBody[weaveIdx];
      if (!label) return ach;
      const kind = classifyLabel(label, lexicon);
      // Soft skills / leadership / problem-solving fit achievements; skip raw tools
      if (kind === 'tool') return ach;
      const desc = String(ach.desc || '');
      const title = String(ach.title || '');
      const host = `${title} ${desc}`;
      if (!/\b(leadership|problem|communication|facilitat|represent|team|skill|professional)\b/i.test(host)) {
        return ach;
      }
      if (/stakeholder|leadership|communication|problem|research|strategy|collaboration/i.test(label)) {
        const nextDesc = weaveSkillIntoSentence(desc, label, kind, { maxLen: 180 });
        if (nextDesc !== desc) {
          achWeaves++;
          weaveIdx++;
          return { ...ach, desc: nextDesc };
        }
      }
      return ach;
    });
  }

  // Cert descriptions: light natural touch for adjacent PM themes only
  if (Array.isArray(r.resumeCerts) && weaveIdx < needBody.length) {
    r.resumeCerts = r.resumeCerts.map((cert, ci) => {
      if (ci > 0 || weaveIdx >= needBody.length) return cert;
      const label = needBody[weaveIdx];
      if (!label) return cert;
      const kind = classifyLabel(label, lexicon);
      if (kind === 'tool') return cert;
      const desc = String(cert.desc || '');
      if (!desc || desc.length > 160) return cert;
      if (!/product|customer|growth|lifecycle|delivery/i.test(desc)) return cert;
      const next = weaveSkillIntoSentence(desc, label, kind, { maxLen: 170 });
      if (next !== desc) weaveIdx++;
      return next === desc ? cert : { ...cert, desc: next };
    });
  }

  // Soft CL touch — skipped when preserveCoverLetter
  if (!preserveCoverLetter) {
    const clThemes = uniqueThemes.slice(0, 3);
    if (c.p2 && clThemes[0] && !String(c.p2).toLowerCase().includes(clThemes[0].toLowerCase())) {
      const kind = classifyLabel(clThemes[0], lexicon);
      let clause;
      if (kind === 'tool') {
        clause = ` I use ${clThemes[0]} day to day in discovery and delivery with engineering and design.`;
      } else if (kind === 'metric') {
        clause = ` I measure success through ${clThemes[0]} alongside adoption and business impact.`;
      } else {
        const themeList = clThemes.slice(0, 2).join(' and ');
        clause = ` Recent work emphasizes ${themeList}, aligning roadmap trade-offs with stakeholders.`;
      }
      if (c.p2.length < 560) {
        c.p2 = `${String(c.p2).replace(/\s+$/, '')}${clause}`;
      }
    }
    if (c.p3 && clThemes[1] && !String(c.p3).toLowerCase().includes(clThemes[1].toLowerCase())) {
      const extra = ` The role's focus on ${clThemes.slice(0, 2).join(' and ').toLowerCase()} matches how I ship product outcomes.`;
      if (c.p3.length < 520 && !/matches how I ship/i.test(c.p3)) {
        c.p3 = `${String(c.p3).replace(/\s+$/, '')}${extra}`;
      }
    }
  }

  return { resume: r, coverLetter: c, added, addedTools, addedMetrics };
}

/** Synonyms so GTM counts for Go-to-Market, etc. */
const SKILL_ALIASES = {
  gtm: ['go to market', 'go-to-market', 'gotomarket'],
  'go to market': ['gtm', 'go-to-market'],
  'cross functional': ['cross-functional', 'cross functional collaboration', 'crossfunctional'],
  'cross functional collaboration': ['cross functional', 'cross-functional'],
  kpis: ['kpi', 'key performance indicators'],
  okrs: ['okr'],
  jira: ['j ira'],
  roi: ['return on investment'],
};

function blobHasSkill(blob, label) {
  const n = normalizeSkill(label);
  if (!n) return false;
  const raw = String(blob || '').toLowerCase();
  // Normalize hyphens/underscores in blob the same way as skill labels ("data-driven" ↔ "data driven")
  const normBlob = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (
    raw.includes(n) ||
    normBlob.includes(n) ||
    raw.includes(n.replace(/\s+/g, '')) ||
    raw.includes(n.replace(/\s+/g, '-')) ||
    normBlob.includes(n.replace(/\s+/g, ''))
  ) {
    return true;
  }
  const aliases = SKILL_ALIASES[n] || [];
  return aliases.some((a) => {
    const an = normalizeSkill(a);
    return (
      raw.includes(an) ||
      normBlob.includes(an) ||
      raw.includes(an.replace(/\s+/g, '-')) ||
      raw.includes(an.replace(/\s+/g, ''))
    );
  });
}

export function scoreTruthAts(resume, coverLetter, jdSkills) {
  const blob = [
    resume?.resumeSummary || '',
    resume?.resumeSkills || '',
    resume?.subtitle || '',
    ...(resume?.resumeExperience || []).map((j) => `${j?.title || ''} ${j?.bullets || ''}`),
    ...(resume?.resumeAchievements || []).map((a) => `${a?.title || ''} ${a?.desc || ''}`),
    ...(resume?.resumeCerts || []).map((a) => `${a?.title || ''} ${a?.desc || ''}`),
    ...(resume?.resumeEducation || []).map((a) => `${a?.degree || ''} ${a?.bullets || ''}`),
    coverLetter?.p1 || '',
    coverLetter?.p2 || '',
    coverLetter?.p3 || '',
    coverLetter?.p4 || '',
  ]
    .join('\n')
    .toLowerCase();

  if (!jdSkills.length) {
    return { score: 100, matched: [], missing: [], mode: 'no-scorable-skills' };
  }

  const matched = [];
  const missing = [];
  for (const item of jdSkills) {
    const label = typeof item === 'string' ? item : item.label;
    if (blobHasSkill(blob, label)) matched.push(label);
    else missing.push(label);
  }
  return {
    score: Math.round((matched.length / jdSkills.length) * 100),
    matched,
    missing,
    mode: 'truth-allowlist',
  };
}

/**
 * Body-only ATS: summary + experience + achievements + certs + CL — excludes skills chips.
 * Third-party scanners weight body text far more than a skills list.
 */
export function scoreBodyAts(resume, coverLetter, jdSkills) {
  const blob = [
    resume?.resumeSummary || '',
    resume?.subtitle || '',
    ...(resume?.resumeExperience || []).map((j) => `${j?.title || ''} ${j?.bullets || ''}`),
    ...(resume?.resumeAchievements || []).map((a) => `${a?.title || ''} ${a?.desc || ''}`),
    ...(resume?.resumeCerts || []).map((a) => `${a?.title || ''} ${a?.desc || ''}`),
    ...(resume?.resumeEducation || []).map((a) => `${a?.degree || ''} ${a?.bullets || ''}`),
    coverLetter?.p1 || '',
    coverLetter?.p2 || '',
    coverLetter?.p3 || '',
    coverLetter?.p4 || '',
    ...(coverLetter?.highlights || []).map((h) => h?.text || ''),
  ]
    .join('\n')
    .toLowerCase();

  if (!jdSkills.length) {
    return { score: 100, matched: [], missing: [], mode: 'no-scorable-skills-body' };
  }

  const matched = [];
  const missing = [];
  for (const item of jdSkills) {
    const label = typeof item === 'string' ? item : item.label;
    if (blobHasSkill(blob, label)) matched.push(label);
    else missing.push(label);
  }
  return {
    score: Math.round((matched.length / jdSkills.length) * 100),
    matched,
    missing,
    mode: 'truth-body',
  };
}

function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Left/right token adjacent to a match (letters/digits only). */
function adjacentToken(text, index, dir) {
  const t = String(text || '');
  if (dir < 0) {
    let i = index - 1;
    while (i >= 0 && /[\s/-]/.test(t[i])) i--;
    if (i < 0 || !/[\w]/.test(t[i])) return '';
    let j = i;
    while (j >= 0 && /[\w]/.test(t[j])) j--;
    return t.slice(j + 1, i + 1);
  }
  let i = index;
  while (i < t.length && /[\s/-]/.test(t[i])) i++;
  if (i >= t.length || !/[\w]/.test(t[i])) return '';
  let j = i;
  while (j < t.length && /[\w]/.test(t[j])) j++;
  return t.slice(i, j);
}

/**
 * True if match is only a fragment of a longer phrase in the text
 * (e.g. highlighting "marketing" inside "product marketing").
 * Prefer no bold over a partial bold.
 */
function isPartialPhraseMatch(text, start, end, labelNorm, labelNorms) {
  const matched = String(text).slice(start, end);
  const left = adjacentToken(text, start, -1);
  const right = adjacentToken(text, end, 1);
  const mNorm = normalizeSkill(matched);
  if (!mNorm) return false;

  const candidates = [];
  if (left) candidates.push(normalizeSkill(`${left} ${matched}`));
  if (right) candidates.push(normalizeSkill(`${matched} ${right}`));
  if (left && right) candidates.push(normalizeSkill(`${left} ${matched} ${right}`));

  for (const phrase of candidates) {
    if (!phrase || phrase === mNorm) continue;
    // Longer JD label covers this span → short match is a fragment
    if (labelNorms.some((ln) => ln !== labelNorm && (ln === phrase || ln.includes(phrase) || phrase.includes(ln)))) {
      return true;
    }
    // Common compounds even if full phrase isn't in the label list
    if (
      /^(product|digital|technical|global|senior|junior|associate|brand|growth|content|performance|affiliate|email|b2b|b2c)\s+/.test(
        phrase,
      ) &&
      mNorm.split(/\s+/).length === 1
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Find first usable (non-fragment) JD keyword match in text.
 * Returns { start, end, norm } or null.
 */
function findUsableKeywordMatch(text, sortedLabels, labelNorms, used) {
  const t = String(text || '');
  for (const label of sortedLabels) {
    const n = normalizeSkill(label);
    if (!n || used.has(n)) continue;
    const shortOk = /^(ai|ml|sql|kpi|kpis|okr|okrs|aws|gtm|api|etl|ux|ui|sap)$/i.test(n);
    if (n.length < 3 && !shortOk) continue;

    const parts = n.split(/\s+/).map(escapeRegExp);
    const re = new RegExp(`(?<![\\w*])${parts.join('[\\s/-]+')}(?![\\w*])`, 'gi');
    let m;
    while ((m = re.exec(t)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (isPartialPhraseMatch(t, start, end, n, labelNorms)) continue;
      return { start, end, norm: n };
    }
  }
  return null;
}

function splitSentences(text) {
  const s = String(text || '').trim();
  if (!s) return [];
  // Keep trailing punctuation with each sentence
  const parts = s.split(/(?<=[.!?])\s+/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * Bold whole sentences that contain a JD keyword (not the bare word).
 * Skip partial fragments ("marketing" in "product marketing").
 * Each keyword bolded at most once when `usedNorms` is shared across calls.
 */
export function highlightJdKeywordsInText(
  text,
  labels,
  { maxHighlights = 1, usedNorms = null } = {},
) {
  let t = String(text || '');
  if (!t || !labels?.length) return t;
  t = t.replace(/\*\*/g, '');

  const sorted = [
    ...new Set(
      labels
        .map((l) => String(typeof l === 'string' ? l : l?.label || '').trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => b.length - a.length);
  const labelNorms = sorted.map(normalizeSkill).filter(Boolean);
  const used = usedNorms || new Set();

  // Preserve multi-line bullets: decide per line / sentence
  const lines = t.split('\n');
  let highlightsLeft = maxHighlights;
  const outLines = lines.map((line) => {
    if (!line.trim() || highlightsLeft <= 0) return line;
    // Bullet lines are usually one sentence; still split if multiple.
    const sentences = splitSentences(line);
    if (!sentences.length) return line;

    let changed = false;
    const next = sentences.map((sentence) => {
      if (highlightsLeft <= 0) return sentence;
      if (/^\*\*[\s\S]*\*\*$/.test(sentence.trim())) return sentence;
      const hit = findUsableKeywordMatch(sentence, sorted, labelNorms, used);
      if (!hit) return sentence;
      used.add(hit.norm);
      highlightsLeft -= 1;
      changed = true;
      const trimmed = sentence.trim();
      return `**${trimmed}**`;
    });

    if (!changed) return line;
    // Rejoin sentences; if original line had no sentence-splitting, next has 1 item
    if (sentences.length === 1) return next[0];
    return next.join(' ');
  });

  return outLines.join('\n');
}

/** Bold JD-bearing sentences in resume body + cover letter (not skills chips). */
export function highlightJdKeywordsInDocs(resume, coverLetter, labels) {
  const r = structuredClone(resume);
  const c = structuredClone(coverLetter);
  const list = (labels || []).map((l) => (typeof l === 'string' ? l : l?.label)).filter(Boolean);
  // One bolded sentence per keyword across the whole pack
  const usedNorms = new Set();

  if (r.resumeSummary) {
    r.resumeSummary = highlightJdKeywordsInText(r.resumeSummary, list, {
      maxHighlights: 1,
      usedNorms,
    });
  }
  // Titles stay plain — bolding a job title looks noisy
  r.resumeExperience = (r.resumeExperience || []).map((job) => ({
    ...job,
    bullets: String(job.bullets || '')
      .split('\n')
      .map((line) =>
        highlightJdKeywordsInText(line, list, { maxHighlights: 1, usedNorms }),
      )
      .join('\n'),
  }));
  r.resumeAchievements = (r.resumeAchievements || []).map((ach) => ({
    ...ach,
    desc: ach.desc
      ? highlightJdKeywordsInText(ach.desc, list, { maxHighlights: 1, usedNorms })
      : ach.desc,
  }));

  for (const field of ['p1', 'p2', 'p3', 'p4']) {
    if (c[field]) {
      c[field] = highlightJdKeywordsInText(c[field], list, {
        maxHighlights: 1,
        usedNorms,
      });
    }
  }
  if (c.highlights?.length) {
    c.highlights = c.highlights.map((h) => ({
      ...h,
      text: highlightJdKeywordsInText(h.text || '', list, {
        maxHighlights: 1,
        usedNorms,
      }),
    }));
  }
  return { resume: r, coverLetter: c };
}
