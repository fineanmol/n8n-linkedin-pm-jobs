#!/usr/bin/env node
/**
 * Pre-export quality gate for resume/CL packs.
 *
 * Goal: high ATS from truth-bound skill overlap — never keyword stuffing.
 *
 * Checks:
 * 1) Docs stay English (no German filler / umlaut spam)
 * 2) No parenthetical keyword dumps
 * 3) No "Familiar with X" / AI-sounding stacking
 * 4) Honest ATS via truth lexicon (Profile proven + PM baseline ≤5y)
 * 5) Woven skills must be truth-allowed (never invent languages/tools)
 *
 * Usage:
 *   node scripts/verify-pack-quality.mjs --pack-dir applications/jobs/li_xxx --jd-file jd.txt [--target 90]
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GERMAN_DOC_BLOCKLIST,
  isMostlyGermanJd,
  stripKeywordSpam,
  normalizeKw,
} from './boost-ats.mjs';
import {
  loadTruthLexicon,
  extractTruthSkillsFromJd,
  resolveTruthSkill,
  scoreTruthAts,
  scoreBodyAts,
  selectScorableTruthSkills,
  normalizeSkill,
} from './truth-lexicon.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const PAREN_SPAM_RE =
  /(\([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9+.#/\- ]{0,40}\)(?:\s*\([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9+.#/\- ]{0,40}\)){2,})/g;

const DE_STEM_RE =
  /\b(zusammenarbeit|erfahrung|kenntnisse|anforderungen|aufgaben|unterstützt|unterstützung|lösung|lösungen|regelmäßig|regelmässig|unterst|sungen|regelm|verst)\b/gi;

const AI_TELL_RE =
  /\b(leverage|synergiz|delve|robust solution|cutting[- ]edge|revolutioniz|paradigm|utilize my skills)\b/gi;

function docBlob(resume, coverLetter) {
  const parts = [
    resume?.resumeSummary || '',
    resume?.resumeSkills || '',
    ...(resume?.resumeExperience || []).map((j) => j?.bullets || ''),
    coverLetter?.p1 || '',
    coverLetter?.p2 || '',
    coverLetter?.p3 || '',
    coverLetter?.p4 || '',
    ...(coverLetter?.highlights || []).map((h) => h?.text || ''),
  ];
  return parts.join('\n');
}

/** Company / role names may legally contain äöü — don't treat those as DE body text. */
function stripProperNounUmlauts(blob, resume, coverLetter) {
  let out = String(blob || '');
  const names = [
    coverLetter?.company,
    coverLetter?.companyName,
    coverLetter?.role,
    coverLetter?.jobTitle,
    coverLetter?.position,
    ...(resume?.resumeExperience || []).map((j) => j?.company),
    ...(resume?.resumeExperience || []).map((j) => j?.title),
  ].filter(Boolean);
  for (const name of names) {
    const n = String(name);
    if (!/[äöüÄÖÜß]/.test(n)) continue;
    // Escape regex special chars in company name
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(esc, 'gi'), n.replace(/[äöüÄÖÜß]/g, ''));
  }
  return out;
}

function countFamiliarSpam(summary) {
  return (String(summary || '').match(/\bFamiliar with\b/gi) || []).length;
}

function countComfortableSpam(summary) {
  return (String(summary || '').match(/\bComfortable with\b/gi) || []).length;
}

/**
 * Analyze JD + verify pack quality.
 */
export function verifyPackQuality({
  resume,
  coverLetter,
  jd,
  masterSkills,
  target = 90,
  truthSkills: truthSkillsIn,
  weaveAudit = [],
}) {
  const issues = [];
  const warnings = [];
  const germanJd = isMostlyGermanJd(jd);
  const lexicon = loadTruthLexicon();
  const truthSkills = selectScorableTruthSkills(
    truthSkillsIn || extractTruthSkillsFromJd(jd, lexicon),
    {
      masterResume: { resumeSkills: masterSkills },
      max: 16,
      jdText: jd,
    },
  );
  const jdLabels = truthSkills.map((t) => (typeof t === 'string' ? t : t.label));
  const blobRaw = docBlob(resume, coverLetter);
  const blob = stripProperNounUmlauts(blobRaw, resume, coverLetter);

  // 1) Parenthetical keyword dumps
  const parenHits = blob.match(PAREN_SPAM_RE) || [];
  if (parenHits.length) {
    issues.push(`parenthetical keyword spam (${parenHits.length} dump(s)): ${parenHits[0].slice(0, 80)}`);
  }

  // 2) German filler in EN docs (umlauts in company names ignored)
  const deHits = blob.match(DE_STEM_RE) || [];
  const blocked = new Set();
  for (const token of blob.toLowerCase().match(/\b[a-zà-ÿ]{4,}\b/g) || []) {
    if (GERMAN_DOC_BLOCKLIST.has(token)) blocked.add(token);
  }
  const umlauts = (blob.match(/[äöüÄÖÜß]/g) || []).length;
  if (deHits.length || blocked.size >= 2 || umlauts >= 2) {
    issues.push(
      `German/filler tokens in EN docs (de=${deHits.slice(0, 5).join(',') || '—'}, blocked=${[...blocked].slice(0, 8).join(',') || '—'}, umlauts=${umlauts})`,
    );
  }

  // 3) AI / stuffing tells
  const familiarCount = countFamiliarSpam(resume?.resumeSummary);
  const comfortableCount = countComfortableSpam(resume?.resumeSummary);
  if (familiarCount > 2) {
    issues.push(`summary stuffed with ${familiarCount} "Familiar with …" phrases`);
  } else if (familiarCount > 1) {
    warnings.push(`${familiarCount} "Familiar with …" phrases in summary`);
  }
  if (comfortableCount > 2) {
    issues.push(`summary stuffed with ${comfortableCount} "Comfortable with …" phrases`);
  }
  const aiTells = blob.match(AI_TELL_RE) || [];
  if (aiTells.length >= 3) {
    warnings.push(`AI-sounding phrasing (${[...new Set(aiTells)].slice(0, 4).join(', ')})`);
  }

  // 4) Residual paren spam after strip
  const cleaned = stripKeywordSpam(blob);
  if (cleaned.length < blob.length * 0.92) {
    issues.push('stripKeywordSpam would remove >8% of text — residual stuffing present');
  }

  // 5) Honest truth ATS + body ATS (exclude skills chips — matches 3rd-party scanners)
  const honestAts = scoreTruthAts(resume, coverLetter, jdLabels);
  const bodyAts = scoreBodyAts(resume, coverLetter, jdLabels);
  const bodyTarget = Math.min(target, Math.max(85, target - 5));
  if (honestAts.score < target && jdLabels.length > 0) {
    if (honestAts.score < Math.max(70, target - 15)) {
      issues.push(
        `honest ATS ${honestAts.score} < ${Math.max(70, target - 15)} (missing: ${honestAts.missing.slice(0, 8).join(', ')})`,
      );
    } else {
      warnings.push(
        `honest ATS ${honestAts.score} below target ${target} (missing: ${honestAts.missing.slice(0, 6).join(', ')})`,
      );
    }
  }
  // Body % is diagnostic only — we no longer rewrite bullets to chase it (kept blank space / dropped lines).
  if (jdLabels.length >= 4 && bodyAts.score < bodyTarget) {
    warnings.push(
      `body ATS ${bodyAts.score} below ${bodyTarget} (chips-only mode; missing body: ${bodyAts.missing.slice(0, 6).join(', ')})`,
    );
  }

  // 6) Every woven skill must resolve via truth lexicon
  for (const woven of weaveAudit || []) {
    const hit = resolveTruthSkill(woven, lexicon);
    if (!hit) {
      issues.push(`woven skill not truth-allowed: ${woven}`);
    }
  }

  // 7) Skills chips should not contain never-invent tokens
  for (const chip of String(resume?.resumeSkills || '').split(',')) {
    const n = normalizeSkill(chip);
    if (lexicon.never.has(n)) {
      issues.push(`never-invent skill on resume: ${chip.trim()}`);
    }
  }

  // 8) German JD must not score DE tokens
  if (
    germanJd &&
    honestAts.missing.some((m) => /[äöüß]/i.test(m) || GERMAN_DOC_BLOCKLIST.has(normalizeKw(m)))
  ) {
    issues.push('German JD still produced DE missing keywords for scoring');
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
    analysis: {
      germanJd,
      jdSkillCount: jdLabels.length,
      jdSkills: jdLabels.slice(0, 16),
      truthTiers: truthSkills.slice(0, 16),
      familiarCount,
      comfortableCount,
      umlautsInDocs: umlauts,
      weaveAudit: [...new Set(weaveAudit || [])],
    },
    honestAts,
    bodyAts,
  };
}

/** Soft auto-fix: strip spam + cap Familiar/Comfortable stacking. */
export function sanitizeForQuality(resume, coverLetter) {
  const r = structuredClone(resume);
  const c = structuredClone(coverLetter);

  r.resumeSummary = stripKeywordSpam(r.resumeSummary || '');
  for (const marker of ['Familiar with', 'Comfortable with']) {
    const re = new RegExp(`(?=\\b${marker}\\b)`, 'i');
    const famParts = r.resumeSummary.split(re);
    if (famParts.length > 2) {
      r.resumeSummary = (famParts[0] + famParts[1]).replace(/\s+/g, ' ').trim();
    }
  }

  r.resumeExperience = (r.resumeExperience || []).map((job) => ({
    ...job,
    bullets: stripKeywordSpam(job.bullets || '')
      .split('\n')
      .map((line) => stripKeywordSpam(line))
      .filter(Boolean)
      .join('\n'),
  }));

  for (const field of ['p1', 'p2', 'p3', 'p4']) {
    if (c[field]) c[field] = stripKeywordSpam(c[field]);
  }
  if (c.highlights?.length) {
    c.highlights = c.highlights.map((h) => ({
      ...h,
      text: stripKeywordSpam(h.text || ''),
    }));
  }
  return { resume: r, coverLetter: c };
}

async function main() {
  const packDir = path.resolve(ROOT, arg('pack-dir') || '');
  const jdFile = path.resolve(arg('jd-file') || '');
  const target = Number(arg('target') || 90);
  if (!packDir || !jdFile) {
    console.error('Need --pack-dir and --jd-file');
    process.exit(1);
  }
  const resume = JSON.parse(await readFile(path.join(packDir, 'resume.json'), 'utf8'));
  const coverLetter = JSON.parse(await readFile(path.join(packDir, 'cover_letter.json'), 'utf8'));
  const jd = await readFile(jdFile, 'utf8');
  const master = JSON.parse(
    await readFile(path.join(ROOT, 'applications/master/sakshi-resume.json'), 'utf8'),
  );

  const result = verifyPackQuality({
    resume,
    coverLetter,
    jd,
    masterSkills: master.resumeSkills,
    target,
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
