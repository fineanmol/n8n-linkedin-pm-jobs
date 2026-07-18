#!/usr/bin/env node
/**
 * Re-export resume(+CL) PDFs with layout locks (skill order + summary cap).
 * Usage:
 *   node scripts/fix-resume-layout.mjs --dir applications/jobs/li_4430883950_dymatrix
 *   node scripts/fix-resume-layout.mjs --all-multipage
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API = process.env.RESUME_API_URL || 'http://127.0.0.1:8791';
const require = createRequire(import.meta.url);

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function pdfPages(filePath) {
  try {
    const { PDFParse } = await import('pdf-parse').catch(() => ({}));
  } catch {
    /* ignore */
  }
  // Prefer pypdf via python for reliability
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(
    'python3',
    [
      '-c',
      `import pypdf; print(len(pypdf.PdfReader(${JSON.stringify(filePath)}).pages))`,
    ],
    { encoding: 'utf8' },
  ).trim();
  return Number(out);
}

async function fixDir(dir) {
  const resumePath = path.join(dir, 'resume.json');
  const clPath = path.join(dir, 'cover_letter.json');
  const resume = JSON.parse(await readFile(resumePath, 'utf8'));
  const coverLetter = JSON.parse(await readFile(clPath, 'utf8'));
  const before = await pdfPages(path.join(dir, 'resume.pdf')).catch(() => null);

  const res = await fetch(`${API}/v1/export_pdfs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume, coverLetter, outputDir: dir }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));

  // Re-read exported? export uses sanitized in-memory; persist sanitized skills/summary back
  // by loading what we sent through a tiny round-trip: update JSON from response isn't available,
  // so apply the same locks client-side for stored JSON consistency.
  const masterSkills =
    'Product Strategy, MVP, Scrum, SDLC, Requirement Gathering, Release Planning, Kanban, SQL, Market Research, SAP, Customer-Centric, A/B Testing, Figma, UI/UX, Power BI, Confluence, n8n, Optimizely, Sprint Planning, MS Office, Conflict Management, Pricing, ETL tools, GitHub, Key performance indicators (KPIs), Stakeholder Management, Google Analytics, JIRA, Project management, Miro, KYC';
  const clean = (s) => s.replace(/\*\*/g, '').trim();
  const master = masterSkills.split(',').map((s) => clean(s)).filter(Boolean);
  const incoming = (resume.resumeSkills || '')
    .split(',')
    .map((s) => clean(s))
    .filter(Boolean);
  const map = new Map(incoming.map((s) => [s.toLowerCase(), s]));
  resume.resumeSkills = master.map((m) => map.get(m.toLowerCase()) || m).join(', ');
  if ((resume.resumeSummary || '').length > 430) {
    const t = resume.resumeSummary.trim();
    const slice = t.slice(0, 430);
    resume.resumeSummary =
      slice.match(/^[\s\S]*?[.!?]\s/)?.[0]?.trim() ||
      slice.replace(/\s+\S*$/, '').trim() + '.';
  }
  await writeFile(resumePath, JSON.stringify(resume, null, 2));

  const after = await pdfPages(path.join(dir, 'resume.pdf'));
  const name = path.basename(dir);
  console.log(`${name}: ${before ?? '?'}p → ${after}p`);
  if (after !== 1) {
    console.error(`  FAIL still ${after} pages`);
    return false;
  }
  return true;
}

async function main() {
  const dirs = [];
  if (process.argv.includes('--all-multipage') || process.argv.includes('--all')) {
    const jobs = path.join(ROOT, 'applications/jobs');
    const onlyMulti = process.argv.includes('--all-multipage');
    for (const name of await readdir(jobs)) {
      const dir = path.join(jobs, name);
      const pdf = path.join(dir, 'resume.pdf');
      const json = path.join(dir, 'resume.json');
      try {
        await readFile(json, 'utf8');
        if (onlyMulti) {
          const n = await pdfPages(pdf);
          if (n > 1) dirs.push(dir);
        } else {
          dirs.push(dir);
        }
      } catch {
        /* skip */
      }
    }
  } else if (arg('dir')) {
    dirs.push(path.resolve(ROOT, arg('dir')));
  } else {
    console.error('Provide --dir <pack>, --all, or --all-multipage');
    process.exit(1);
  }

  let ok = 0;
  let bad = 0;
  for (const dir of dirs) {
    try {
      if (await fixDir(dir)) ok++;
      else bad++;
    } catch (e) {
      console.error(path.basename(dir), e.message || e);
      bad++;
    }
  }
  console.log(`fixed_ok=${ok} still_bad=${bad}`);
  process.exit(bad ? 2 : 0);
}

main();
