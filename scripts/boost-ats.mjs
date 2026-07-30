#!/usr/bin/env node
/**
 * Truth-bound ATS boost to >= target (default 90).
 *
 * Rules:
 * - NEVER append "(keyword)" spam to bullets or CL paragraphs.
 * - DE JD terms → EN via truth map, then Tier A (Profile) or Tier B (PM baseline ≤5y).
 * - Never invent languages, niche tools, fake metrics, or senior claims.
 * - Humanized weave: skills chips + at most one natural summary/CL clause.
 * - Strip any existing parenthetical keyword dumps from prior bad packs.
 *
 * Usage:
 *   node scripts/boost-ats.mjs --pack-dir applications/jobs/li_xxx --jd-file /tmp/jd.txt [--target 90]
 */
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadTruthLexicon,
  extractTruthSkillsFromJd,
  resolveTruthSkill,
  humanizeWeave,
  scoreTruthAts,
  scoreBodyAts,
  selectScorableTruthSkills,
} from './truth-lexicon.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API = process.env.RESUME_API_URL || 'http://127.0.0.1:8791';
const MVP = path.resolve(ROOT, '../Site/resume-cv-mvp');

/** Only these (or master skills) may be woven into docs. */
export const SKILL_CATALOG = [
  'Product Owner',
  'Product Manager',
  'Product Lead',
  'Roadmaps',
  'Backlog',
  'Agile',
  'Scrum',
  'Kanban',
  'Stakeholder Management',
  'SQL',
  'A/B Testing',
  'Experimentation',
  'Pricing',
  'Market Research',
  'GTM',
  'SaaS',
  'B2B',
  'CRM',
  'Salesforce',
  'API',
  'KPIs',
  'OKRs',
  'Analytics',
  'Figma',
  'JIRA',
  'Magento',
  'Loyalty',
  'Fintech',
  'AI',
  'ML',
  'Machine Learning',
  'E-commerce',
  'Logistics',
  'Paid Search',
  'Martech',
  'Marketplace',
  'Customer Acquisition',
  'SEO',
  'Prioritization',
  'User Experience',
  'User Research',
  'Product Strategy',
  'MVP',
  'Power BI',
  'Tableau',
  'Python',
  'Cross-functional',
];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Common German filler that old ATS extractors treated as "keywords". */
export const GERMAN_FILLER = new Set(
  `
  und oder der die das den dem des ein eine einer einem eines ist sind war
  mit von für auf zum zur auch nicht sich wir sie uns ihr ihre deiner deine
  unsere unserer unserem unseren arbeit arbeiten erfahrung zusammenarbeit
  kenntnisse anforderungen aufgaben bereich bereiche sowie durch
  nach über als bei bis hast bist wird werden kann sollen sollte etwa
  innen lösen lösung lösungen regelmäßig regelmässig unterstützt
  unterstützung unserer eurer sungen regelm verst unterst
  `.trim().split(/\s+/),
);

/** Clearly German (not shared with English) — used to reject DE tokens in EN docs. */
export const GERMAN_DOC_BLOCKLIST = new Set([
  ...GERMAN_FILLER,
  'zusammenarbeit',
  'erfahrung',
  'kenntnisse',
  'anforderungen',
  'aufgaben',
  'bereich',
  'bereiche',
  'lösung',
  'lösungen',
  'unterstützt',
  'unterstützung',
  'regelmäßig',
  'regelmässig',
  'sowie',
  'oder',
  'eine',
  'einer',
  'unserer',
  'deine',
  'hast',
  'bist',
  'unterst',
  'sungen',
  'regelm',
  'verst',
]);

/** True if JD is mostly German (resume/CL stay English — never weave DE filler). */
export function isMostlyGermanJd(jd) {
  const t = String(jd || '');
  if (!t || t.length < 40) return false;
  const deHits = (t.match(/\b(und|oder|der|die|das|mit|von|für|nicht|sich|wir|eine|einer| ent|ung|keit|schen|denn|auch|sowie|aufgaben|anforderungen)\b/gi) || []).length;
  const enHits = (t.match(/\b(the|and|with|for|you|our|will|experience|requirements|responsibilities)\b/gi) || []).length;
  const umlauts = (t.match(/[äöüÄÖÜß]/g) || []).length;
  return umlauts >= 3 || deHits >= 12 && deHits > enHits * 1.2;
}

/** Remove trailing (kw) (kw) (kw) dumps from older bad boosts (EN + DE). */
export function stripKeywordSpam(text) {
  if (!text) return text;
  return String(text)
    // 2+ parenthetical tokens in a row (ascii or unicode letters)
    .replace(/(\s*\([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9+.#/\- ]{0,40}\)){2,}\.?/g, '')
    // even a single trailing (german-ish|filler) token left by partial cleans
    .replace(/\s*\(([a-zà-ÿ][a-zà-ÿ0-9+.#/\-]{1,30})\)\.?$/gim, (full, word) => {
      const w = String(word || '').toLowerCase();
      if (GERMAN_FILLER.has(w) || w.length <= 3) return '';
      // drop truncated DE stems like unterst / sungen / regelm
      if (/^(unterst|sungen|regelm|verst|unser|euer|dein|eine|oder|hast|bist|innen)/i.test(w)) {
        return '';
      }
      return full;
    })
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;])/g, '$1')
    .replace(/\s+$/gm, '')
    .trim();
}

/** Strip markdown **bold** from pack text (no keyword highlighting in PDFs). */
function stripMdBold(text) {
  return String(text || '').replace(/\*\*/g, '');
}

function cleanDocSpam(resume, cl) {
  const r = structuredClone(resume);
  const c = structuredClone(cl);
  r.resumeSummary = stripMdBold(stripKeywordSpam(r.resumeSummary));
  r.resumeExperience = (r.resumeExperience || []).map((job) => ({
    ...job,
    bullets: stripMdBold(stripKeywordSpam(job.bullets || ''))
      .split('\n')
      .map((line) => line.replace(/\s+\(user experience\)|\s+\(ai-powered\)|\s+\(end-to-end\)|\s+\(ownership\)|\s+\(strong\)|\s+\(build\)|\s+\(help\)/gi, ''))
      .map((line) => stripKeywordSpam(line))
      .filter(Boolean)
      .join('\n'),
  }));
  if (Array.isArray(r.resumeAchievements)) {
    r.resumeAchievements = r.resumeAchievements.map((a) => ({
      ...a,
      title: stripMdBold(a?.title || ''),
      desc: stripMdBold(stripKeywordSpam(a?.desc || '')),
    }));
  }
  for (const field of ['p1', 'p2', 'p3', 'p4']) {
    if (c[field]) c[field] = stripMdBold(stripKeywordSpam(c[field]));
  }
  if (c.highlights?.length) {
    c.highlights = c.highlights.map((h) => ({
      ...h,
      text: stripMdBold(stripKeywordSpam(h.text || '')),
    }));
  }
  return { resume: r, coverLetter: c };
}

export function normalizeKw(kw) {
  return String(kw || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Map scorer "missing" tokens to a display label only if truth-allowed. */
export function resolveAllowedKeyword(raw, masterSkills) {
  const lexicon = loadTruthLexicon();
  const hit = resolveTruthSkill(raw, lexicon);
  if (hit) return hit.label;

  const n = normalizeKw(raw);
  if (!n || n.length < 2) return null;
  if (/[äöüß]/i.test(n) || GERMAN_FILLER.has(n)) return null;
  if (/^(der|die|das|und|oder|mit|von|für|eine|einer|nicht|sich|wir|team)$/i.test(n)) {
    return null;
  }

  const masterList = String(masterSkills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const label of [...SKILL_CATALOG, ...masterList]) {
    const ln = normalizeKw(label);
    if (ln === n || ln.includes(n) || n.includes(ln)) {
      const truth = resolveTruthSkill(label, lexicon);
      return truth ? truth.label : null;
    }
  }
  return null;
}

function boostDocs(resume, cl, missing, masterSkills, jdThemes = []) {
  const lexicon = loadTruthLexicon();
  const allowed = [];
  for (const raw of missing) {
    const hit = resolveTruthSkill(raw, lexicon) || {
      label: resolveAllowedKeyword(raw, masterSkills),
    };
    const label = hit?.label;
    if (label && !allowed.some((a) => normalizeKw(a) === normalizeKw(label))) {
      allowed.push(label);
    }
  }

  // Always pass JD themes so summary/bullets rewrite even if chip list is full
  const themes = [...jdThemes, ...allowed].filter(Boolean);
  // Skills chips (+ headline already set in compose). No bullet duplication of chip skills.
  const woven = humanizeWeave(resume, cl, allowed.length ? allowed : themes.slice(0, 10), {
    maxFamiliar: 0,
    maxBulletWeaves: 0,
    maxAchievementWeaves: 0,
    lexicon,
    jdThemes: themes,
    skillsOnly: true,
    prioritizeBodyLabels: [],
  });
  // Keep master skill order first, then woven additions
  const master = (masterSkills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const skills = (woven.resume.resumeSkills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const byLower = new Map(skills.map((s) => [s.toLowerCase(), s]));
  const ordered = [];
  for (const m of master) {
    ordered.push(byLower.get(m.toLowerCase()) || m);
  }
  for (const s of skills) {
    if (!ordered.some((x) => x.toLowerCase() === s.toLowerCase())) ordered.push(s);
  }
  woven.resume.resumeSkills = ordered.slice(0, Math.max(master.length + 12, 36)).join(', ');
  return {
    resume: woven.resume,
    coverLetter: woven.coverLetter,
    allowedCount: Math.max(allowed.length, themes.length ? 1 : 0),
    added: woven.added,
  };
}

async function scoreViaApi(resume, coverLetter, jd) {
  const { spawnSync } = await import('node:child_process');
  const script = `
import { readFileSync } from 'fs';
import { scoreAtsMatch } from '${MVP.replace(/\\/g, '/')}/server/score.ts';
const resume = JSON.parse(readFileSync(process.argv[2],'utf8'));
const cl = JSON.parse(readFileSync(process.argv[3],'utf8'));
const jd = readFileSync(process.argv[4],'utf8');
const ats = scoreAtsMatch(resume, cl, jd);
console.log(JSON.stringify(ats));
`;
  const tmpJs = path.join('/tmp', `ats_score_${Date.now()}.mts`);
  await writeFile(tmpJs, script);
  const resumePath = path.join('/tmp', `ats_r_${Date.now()}.json`);
  const clPath = path.join('/tmp', `ats_c_${Date.now()}.json`);
  const jdPath = path.join('/tmp', `ats_j_${Date.now()}.txt`);
  await writeFile(resumePath, JSON.stringify(resume));
  await writeFile(clPath, JSON.stringify(coverLetter));
  await writeFile(jdPath, jd);
  const r = spawnSync('npx', ['tsx', tmpJs, resumePath, clPath, jdPath], {
    cwd: MVP,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`score failed: ${r.stderr || r.stdout}`);
  }
  const line = (r.stdout || '').trim().split('\n').filter(Boolean).pop();
  return JSON.parse(line);
}

async function main() {
  const packDir = path.resolve(ROOT, arg('pack-dir') || '');
  const jdFile = path.resolve(arg('jd-file') || '');
  const target = Number(arg('target') || 90);
  if (!packDir || !jdFile) {
    console.error('Need --pack-dir and --jd-file');
    process.exit(1);
  }
  let resume = JSON.parse(await readFile(path.join(packDir, 'resume.json'), 'utf8'));
  let coverLetter = JSON.parse(await readFile(path.join(packDir, 'cover_letter.json'), 'utf8'));
  const jd = await readFile(jdFile, 'utf8');
  const master = JSON.parse(
    await readFile(path.join(ROOT, 'applications/master/sakshi-resume.json'), 'utf8'),
  );

  // Strip legacy keyword spam first
  ({ resume, coverLetter } = cleanDocSpam(resume, coverLetter));

  resume.avatar = master.avatar;
  resume.layoutSettings = { ...(resume.layoutSettings || {}), showPhoto: true };
  coverLetter.avatar = master.avatar;
  coverLetter.layoutSettings = { ...(coverLetter.layoutSettings || {}), showPhoto: true };

  const germanJd = isMostlyGermanJd(jd);
  const lexicon = loadTruthLexicon({ masterResume: master });
  const allTruthSkills = extractTruthSkillsFromJd(jd, lexicon);
  const truthSkills = selectScorableTruthSkills(allTruthSkills, {
    masterResume: master,
    max: 16,
    jdText: jd,
  });
  const truthLabels = truthSkills.map((t) => t.label);
  console.log(
    `${germanJd ? 'JD looks German — ' : ''}Scorable JD skills ${truthLabels.length}/${allTruthSkills.length}:`,
    truthLabels.slice(0, 14).join(', '),
  );

  // Gate 3: honest ATS = skills chips + body (real PDF scans include skills).
  // Scorable keywords are JD-ranked (requirements/tools first), not master-biased fluff.
  // Body-only % is diagnostic only — not used as the sheet score.
  const bodyTarget = Math.min(target, Math.max(85, target - 5)); // diagnostic only
  let truthAts = scoreTruthAts(resume, coverLetter, truthLabels);
  let bodyAts = scoreBodyAts(resume, coverLetter, truthLabels);
  console.log(
    'Truth ATS before',
    truthAts.score,
    'body',
    bodyAts.score,
    'missing',
    truthAts.missing.slice(0, 12),
  );

  let weaveAudit = [];
  let guard = 0;
  // Honest ATS via skills chips only — no experience rewrites for terms already on chips.
  while (truthAts.score < target && truthAts.missing.length && guard < 6) {
    const need = truthAts.missing.slice(0, 12);
    const next = boostDocs(
      resume,
      coverLetter,
      need,
      master.resumeSkills,
      truthLabels,
    );
    if (next.allowedCount === 0 && !(next.added || []).length) {
      console.log('No more truth-allowed skills to swap — stopping (will not invent)');
      break;
    }
    resume = next.resume;
    coverLetter = next.coverLetter;
    weaveAudit.push(...(next.added || []));
    truthAts = scoreTruthAts(resume, coverLetter, truthLabels);
    bodyAts = scoreBodyAts(resume, coverLetter, truthLabels);
    console.log(
      `Truth ATS pass ${guard + 1}`,
      truthAts.score,
      'body',
      bodyAts.score,
      'still missing chips',
      truthAts.missing.slice(0, 8),
    );
    guard++;
  }

  // Optional legacy scorer for diagnostics only (never drives DE filler weave)
  let ats = { score: truthAts.score, missing: truthAts.missing, matched: truthAts.matched };
  try {
    const apiAts = await scoreViaApi(resume, coverLetter, jd);
    console.log('Legacy scorer (diag)', apiAts.score, 'raw missing sample', (apiAts.missing || []).slice(0, 6));
  } catch (e) {
    console.log('Legacy scorer skipped:', e.message?.slice(0, 120));
  }

  // Quality gate: analyze + verify BEFORE any PDF export / write that we'd ship
  const { verifyPackQuality, sanitizeForQuality } = await import('./verify-pack-quality.mjs');
  ({ resume, coverLetter } = sanitizeForQuality(resume, coverLetter));
  let quality = verifyPackQuality({
    resume,
    coverLetter,
    jd,
    masterSkills: master.resumeSkills,
    target,
    truthSkills,
    weaveAudit,
  });

  // One more skills-only pass if honest ATS still short
  let honestGuard = 0;
  while (
    quality.ok &&
    quality.honestAts.score < target &&
    quality.honestAts.missing.length &&
    honestGuard < 4
  ) {
    const need = quality.honestAts.missing.slice(0, 12);
    const next = boostDocs(
      resume,
      coverLetter,
      need,
      master.resumeSkills,
      truthLabels,
    );
    if (next.allowedCount === 0) break;
    resume = next.resume;
    coverLetter = next.coverLetter;
    weaveAudit.push(...(next.added || []));
    ({ resume, coverLetter } = sanitizeForQuality(resume, coverLetter));
    quality = verifyPackQuality({
      resume,
      coverLetter,
      jd,
      masterSkills: master.resumeSkills,
      target,
      truthSkills,
      weaveAudit,
    });
    console.log(
      `Honest ATS pass ${honestGuard + 1}`,
      quality.honestAts.score,
      'body',
      quality.bodyAts?.score,
      'missing body',
      (quality.bodyAts?.missing || []).slice(0, 8),
    );
    honestGuard++;
  }

  if (!quality.ok) {
    console.error('QUALITY GATE FAILED — refusing export/upload:');
    for (const issue of quality.issues) console.error('  -', issue);
    console.error(
      JSON.stringify(
        { analysis: quality.analysis, honestAts: quality.honestAts, bodyAts: quality.bodyAts },
        null,
        2,
      ),
    );
    process.exit(4);
  }
  if (quality.warnings.length) {
    console.log('Quality warnings:', quality.warnings.join('; '));
  }
  console.log(
    `Quality OK — germanJd=${quality.analysis.germanJd} honestAts=${quality.honestAts.score} bodyAts=${quality.bodyAts?.score} jdSkills=${quality.analysis.jdSkillCount} woven=${[...new Set(weaveAudit)].join(', ') || 'none'}`,
  );

  if (quality.honestAts.score < target) {
    console.error(
      `FAILED honest ATS ${quality.honestAts.score} < ${target} (missing: ${(quality.honestAts.missing || []).slice(0, 10).join(', ')})`,
    );
    process.exit(2);
  }
  if ((quality.bodyAts?.score ?? 0) < bodyTarget && truthLabels.length >= 4) {
    console.log(
      `Body ATS ${quality.bodyAts.score} < ${bodyTarget} (chips-only mode — not failing; missing body: ${(quality.bodyAts.missing || []).slice(0, 10).join(', ')})`,
    );
  }
  // Sheet score = honest ATS (skills + existing master body). No bullet rewrites.
  ats = {
    score: quality.honestAts.score,
    missing: quality.honestAts.missing,
    matched: quality.honestAts.matched,
  };

  await writeFile(
    path.join(packDir, 'truth_audit.json'),
    JSON.stringify(
      {
        germanJd,
        truthSkills,
        woven: [...new Set(weaveAudit)],
        matched: ats.matched,
        missing: ats.missing,
        score: ats.score,
        boldKeywords: true,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  await writeFile(path.join(packDir, 'resume.json'), JSON.stringify(resume, null, 2));
  await writeFile(path.join(packDir, 'cover_letter.json'), JSON.stringify(coverLetter, null, 2));
  await writeFile(
    path.join(packDir, 'quality.json'),
    JSON.stringify({ ...quality, atsScore: ats.score, checkedAt: new Date().toISOString() }, null, 2),
  );

  function countPages() {
    return Number(
      spawnSync(
        'python3',
        [
          '-c',
          `import pypdf; print(len(pypdf.PdfReader(${JSON.stringify(path.join(packDir, 'resume.pdf'))}).pages))`,
        ],
        { encoding: 'utf8' },
      ).stdout.trim(),
    );
  }

  /**
   * Fit to 1 page WITHOUT dropping experience bullets (that left blank space).
   * Only soft-trim summary/CL length; optionally nudge fontSize down slightly.
   */
  function compactForOnePage(resDoc, clDoc, { hard = false } = {}) {
    const r = structuredClone(resDoc);
    const c = structuredClone(clDoc);
    const sumCap = hard ? 340 : 400;
    if ((r.resumeSummary || '').length > sumCap) {
      const t = r.resumeSummary.slice(0, sumCap);
      r.resumeSummary = (t.match(/^[\s\S]*[.!?]/)?.[0] || t.replace(/\s+\S*$/, '')).trim();
      if (!/[.!?]$/.test(r.resumeSummary)) r.resumeSummary += '.';
    }
    // Keep every experience bullet — never slice lines away
    r.resumeExperience = (r.resumeExperience || []).map((job) => ({
      ...job,
      bullets: String(job.bullets || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n'),
    }));
    for (const field of ['p2', 'p3']) {
      const cap = hard ? 320 : 400;
      if (c[field] && c[field].length > cap) {
        const t = c[field].slice(0, cap);
        c[field] = (t.match(/^[\s\S]*[.!?]/)?.[0] || t.replace(/\s+\S*$/, '')).trim();
        if (!/[.!?]$/.test(c[field])) c[field] += '.';
      }
    }
  if (hard) {
      const fs = Number(r.layoutSettings?.fontSize ?? 10);
      r.layoutSettings = {
        ...(r.layoutSettings || {}),
        fontSize: Math.max(8.5, fs - 1),
        lineHeight: Math.min(Number(r.layoutSettings?.lineHeight ?? 1.22), 1.15),
      };
    }
    return { resume: r, coverLetter: c };
  }

  async function exportPdfs(resDoc, clDoc) {
    const res = await fetch(`${API}/v1/export_pdfs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume: resDoc, coverLetter: clDoc, outputDir: packDir }),
    });
    const exported = await res.json();
    if (!res.ok) {
      console.error(exported);
      process.exit(1);
    }
    return exported;
  }

  let exported = await exportPdfs(resume, coverLetter);
  let pages = countPages();

  if (pages !== 1) {
    console.log(`Resume is ${pages} page(s) — soft trim summary/CL (keeping all bullets)`);
    ({ resume, coverLetter } = compactForOnePage(resume, coverLetter, { hard: false }));
    await writeFile(path.join(packDir, 'resume.json'), JSON.stringify(resume, null, 2));
    await writeFile(path.join(packDir, 'cover_letter.json'), JSON.stringify(coverLetter, null, 2));
    exported = await exportPdfs(resume, coverLetter);
    pages = countPages();
  }
  if (pages !== 1) {
    console.log(`Still ${pages} page(s) — slightly smaller font (still keeping all bullets)`);
    ({ resume, coverLetter } = compactForOnePage(resume, coverLetter, { hard: true }));
    await writeFile(path.join(packDir, 'resume.json'), JSON.stringify(resume, null, 2));
    await writeFile(path.join(packDir, 'cover_letter.json'), JSON.stringify(coverLetter, null, 2));
    exported = await exportPdfs(resume, coverLetter);
    pages = countPages();
  }

  console.log(
    JSON.stringify(
      { atsScore: ats.score, pages, missing: ats.missing.slice(0, 10), exported },
      null,
      2,
    ),
  );
  if (pages !== 1) {
    // Last resort: one more font nudge (never drop bullets)
    console.log(`Still ${pages} page(s) — final font nudge`);
    resume.layoutSettings = {
      ...(resume.layoutSettings || {}),
      fontSize: 8.5,
      lineHeight: 1.12,
    };
    await writeFile(path.join(packDir, 'resume.json'), JSON.stringify(resume, null, 2));
    exported = await exportPdfs(resume, coverLetter);
    pages = countPages();
  }
  if (pages !== 1) {
    console.error('WARN: resume is not 1 page after boost + compact');
    process.exit(3);
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
