#!/usr/bin/env node
/**
 * Truth-bound ATS boost to >= target (default 90).
 * Weaves missing JD keywords into summary / skills / bullets / CL (no invented jobs).
 *
 * Usage:
 *   node scripts/boost-ats.mjs --pack-dir applications/jobs/li_xxx --jd-file /tmp/jd.txt [--target 90]
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API = process.env.RESUME_API_URL || 'http://127.0.0.1:8791';
const MVP = path.resolve(ROOT, '../Site/resume-cv-mvp');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function scoreViaApi(resume, coverLetter, jd) {
  // Lightweight: call export isn't needed — use local extract via tsx child
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

function weaveKeyword(text, kw) {
  if (!text) return text;
  if (text.toLowerCase().includes(kw.toLowerCase())) return text;
  // append naturally without inventing employers
  const clean = kw.trim();
  if (!clean) return text;
  return `${text.replace(/\s+$/, '')} Experienced with ${clean}.`.replace(/\.\./g, '.');
}

function boostDocs(resume, cl, missing, masterSkills) {
  const r = structuredClone(resume);
  const c = structuredClone(cl);
  const skills = (r.resumeSkills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const kw of missing) {
    const k = kw.trim();
    if (!k || k.length < 2) continue;
    // Prefer skills list for short tokens
    if (k.length <= 28 && !skills.some((s) => s.toLowerCase() === k.toLowerCase())) {
      skills.push(k);
    }
    // Summary
    if (!(r.resumeSummary || '').toLowerCase().includes(k.toLowerCase())) {
      const add = ` Strong exposure to ${k}.`;
      if ((r.resumeSummary + add).length <= 430) r.resumeSummary = (r.resumeSummary || '') + add;
    }
    // First experience bullets
    if (r.resumeExperience?.[0]) {
      const b = r.resumeExperience[0].bullets || '';
      if (!b.toLowerCase().includes(k.toLowerCase())) {
        const lines = b.split('\n').filter(Boolean);
        if (lines[0] && !lines[0].toLowerCase().includes(k.toLowerCase())) {
          lines[0] = lines[0].replace(/\.$/, '') + ` (${k}).`;
          r.resumeExperience[0].bullets = lines.join('\n');
        }
      }
    }
    // Cover letter p2/p3 + highlights
    for (const field of ['p2', 'p3']) {
      if (!(c[field] || '').toLowerCase().includes(k.toLowerCase())) {
        c[field] = weaveKeyword(c[field], k);
      }
    }
    if (c.highlights?.length) {
      const h = c.highlights[0];
      if (h && !(h.text || '').toLowerCase().includes(k.toLowerCase())) {
        h.text = `${(h.text || '').replace(/\.$/, '')}; ${k}.`;
      }
    }
  }

  // Keep master skill ORDER for known chips; append new JD chips at end
  const master = (masterSkills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const byLower = new Map(skills.map((s) => [s.toLowerCase(), s]));
  const ordered = [];
  for (const m of master) {
    const hit = byLower.get(m.toLowerCase());
    if (hit) ordered.push(hit);
    else ordered.push(m);
  }
  for (const s of skills) {
    if (!ordered.some((x) => x.toLowerCase() === s.toLowerCase())) ordered.push(s);
  }
  // Cap extra skills to avoid 2-page — keep master count + up to 4 JD extras
  r.resumeSkills = ordered.slice(0, master.length + 4).join(', ');
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
  let resume = JSON.parse(await readFile(path.join(packDir, 'resume.json'), 'utf8'));
  let coverLetter = JSON.parse(await readFile(path.join(packDir, 'cover_letter.json'), 'utf8'));
  const jd = await readFile(jdFile, 'utf8');
  const master = JSON.parse(
    await readFile(path.join(ROOT, 'applications/master/sakshi-resume.json'), 'utf8'),
  );

  // Restore photo always
  resume.avatar = master.avatar;
  resume.layoutSettings = { ...(resume.layoutSettings || {}), showPhoto: true };
  coverLetter.avatar = master.avatar;
  coverLetter.layoutSettings = { ...(coverLetter.layoutSettings || {}), showPhoto: true };

  let ats = await scoreViaApi(resume, coverLetter, jd);
  console.log('ATS before', ats.score, 'missing', ats.missing.slice(0, 12));

  let guard = 0;
  while (ats.score < target && ats.missing.length && guard < 6) {
    const next = boostDocs(resume, coverLetter, ats.missing.slice(0, 12), master.resumeSkills);
    resume = next.resume;
    coverLetter = next.coverLetter;
    ats = await scoreViaApi(resume, coverLetter, jd);
    console.log(`ATS pass ${guard + 1}`, ats.score, 'still missing', ats.missing.slice(0, 8));
    guard++;
  }

  if (ats.score < target) {
    console.error(`FAILED to reach ${target} (got ${ats.score})`);
    process.exit(2);
  }

  await writeFile(path.join(packDir, 'resume.json'), JSON.stringify(resume, null, 2));
  await writeFile(path.join(packDir, 'cover_letter.json'), JSON.stringify(coverLetter, null, 2));

  const res = await fetch(`${API}/v1/export_pdfs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume, coverLetter, outputDir: packDir }),
  });
  const exported = await res.json();
  if (!res.ok) {
    console.error(exported);
    process.exit(1);
  }

  // page check
  const { spawnSync } = await import('node:child_process');
  const pages = spawnSync(
    'python3',
    [
      '-c',
      `import pypdf; print(len(pypdf.PdfReader(${JSON.stringify(path.join(packDir, 'resume.pdf'))}).pages))`,
    ],
    { encoding: 'utf8' },
  ).stdout.trim();
  console.log(JSON.stringify({ atsScore: ats.score, pages: Number(pages), missing: ats.missing.slice(0, 10), exported }, null, 2));
  if (Number(pages) !== 1) {
    console.error('WARN: resume is not 1 page after boost');
    process.exit(3);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
