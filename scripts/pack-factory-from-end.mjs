#!/usr/bin/env node
/**
 * Pack factory: walk Not Applied jobs from the END of the sheet upward.
 * For each open job: compose ATS≥90 resume+CL → R2 → sheet status "Ready to Apply".
 * Does NOT submit applications.
 *
 * Usage:
 *   node scripts/pack-factory-from-end.mjs --csv /tmp/sakshi_jobs_live.csv --limit 30
 *   node scripts/pack-factory-from-end.mjs --limit 50 --concurrency 1
 */
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLinkedInJobOpen } from './check-job-open.mjs';
import { evaluateExperience } from './experience-filter.mjs';
import { extractGermanRequired, shouldSkipForGerman } from './extract-german-required.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WEBHOOK =
  process.env.N8N_SAVE_DOCS_WEBHOOK ||
  'https://n8n.fineanmol.dev/webhook/save-application-docs';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function parseCsv(text) {
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
  const headers = rows[0];
  return rows.slice(1).map((cols) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] ?? '';
    });
    return obj;
  });
}

function decode(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

async function sheetPost(payload) {
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 300) };
}

function runCompose({ jobId, company, role, jdFile, sheetRow }) {
  return new Promise((resolve) => {
    const args = [
      path.join(ROOT, 'scripts/agent-compose-pack.mjs'),
      '--job-id',
      jobId,
      '--company',
      company,
      '--role',
      role,
      '--jd-file',
      jdFile,
      '--status',
      'Ready to Apply',
    ];
    if (sheetRow) args.push('--sheet-row', String(sheetRow));
    const child = spawn('node', args, {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += d;
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      err += d;
      process.stderr.write(d);
    });
    child.on('close', (code) => {
      resolve({ code, out, err });
    });
  });
}

function logProgress(entry) {
  const dir = path.join(ROOT, 'applications/queues');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'pack_factory_progress.jsonl');
  appendFileSync(p, JSON.stringify({ ...entry, at: new Date().toISOString() }) + '\n');
}

function isAlreadyPacked(jobId) {
  const jobsRoot = path.join(ROOT, 'applications/jobs');
  if (!existsSync(jobsRoot)) return false;
  for (const name of readdirSync(jobsRoot)) {
    if (!name.startsWith(jobId)) continue;
    const dir = path.join(jobsRoot, name);
    const sheetPath = path.join(dir, 'sheet_fields.json');
    if (!existsSync(path.join(dir, 'resume.pdf')) || !existsSync(sheetPath)) continue;
    try {
      const s = JSON.parse(readFileSync(sheetPath, 'utf8'));
      const ats = Number(s.ats_score || 0);
      const st = (s.status || '').trim();
      if (ats >= 90 && (st === 'Ready to Apply' || st === 'Applied' || existsSync(path.join(dir, 'r2.json')))) {
        return { ats, st, sheetFields: s, dir };
      }
    } catch {
      /* continue */
    }
  }
  return false;
}

/** Same spirit as scraper Config.excludedRoleKeywords — skip before compose. */
function excludedTitleReason(title) {
  const t = String(title || '').toLowerCase();
  const kws = [
    'intern',
    'internship',
    'werkstudent',
    'praktikum',
    'praktikant',
    'working student',
    'ausbildung',
    'director of product',
    'director product',
    'vice president',
    'vp product',
    'head of product',
    'chief product',
  ];
  for (const kw of kws) {
    if (t.includes(kw)) return kw;
  }
  return null;
}

/** Latest result per job_id from pack_factory_progress.jsonl */
function loadTriedJobIds() {
  const p = path.join(ROOT, 'applications/queues/pack_factory_progress.jsonl');
  const tried = new Map();
  if (!existsSync(p)) return tried;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      if (o.job_id && o.result) tried.set(o.job_id, o.result);
    } catch {
      /* skip */
    }
  }
  return tried;
}

async function processOne(job, tmpDir, { force = false } = {}) {
  console.log(`\n▶ row ${job.sheet_row} | ${job.job_id} | ${job.company} | ${job.position.slice(0, 60)}`);

  const excluded = excludedTitleReason(job.position);
  if (excluded) {
    const reason = `excluded title keyword: ${excluded}`;
    console.log(`  not qualified — ${reason}`);
    await sheetPost({
      job_id: job.job_id,
      status: 'not qualified',
      notes: `NOT QUALIFIED ${new Date().toISOString().slice(0, 10)} — ${reason} (pack factory)`,
    });
    logProgress({ ...job, result: 'NotQualified', notes: reason });
    return { result: 'NotQualified' };
  }

  // Lead/Senior/Global kept here — YOE>=5 gated later from JD text

  const packed = force ? false : isAlreadyPacked(job.job_id);
  if (packed) {
    // Keep sheet in sync — local pack exists but status may still be Not Applied
    const sf = packed.sheetFields || {};
    console.log(`  already packed (ats ${packed.ats}) — sync sheet Ready to Apply`);
    await sheetPost({
      job_id: job.job_id,
      status: 'Ready to Apply',
      resume_used: sf.resume_used || undefined,
      cover_letter_used: sf.cover_letter_used || undefined,
      ats_score: sf.ats_score || packed.ats,
      notes: sf.notes || `Pack ready (ATS ${packed.ats}). Synced by pack factory.`,
      pack_folder: sf.pack_folder || undefined,
      resume_variant_id: sf.resume_variant_id || undefined,
      form_answers: sf.form_answers || undefined,
    });
    logProgress({ ...job, result: 'AlreadyPacked', notes: `ats ${packed.ats}; sheet synced` });
    return { result: 'AlreadyPacked' };
  }

  let check;
  try {
    check = await checkLinkedInJobOpen({ jobId: job.job_id, url: job.job_url });
  } catch (e) {
    console.log(`  open-check failed: ${e.message}`);
    logProgress({ ...job, result: 'CheckFailed', notes: e.message });
    return { result: 'CheckFailed' };
  }

  if (!check.open) {
    const reason = check.reason || 'closed';
    if (/429|rate.?limit|fetch_failed_429/i.test(reason)) {
      console.log(`  skip (rate limit, not expired): ${reason}`);
      logProgress({ ...job, result: 'Skipped', notes: reason });
      return { result: 'Skipped' };
    }
    console.log(`  closed → Not Available Now (${reason})`);
    await sheetPost({
      job_id: job.job_id,
      status: 'Not Available Now',
      notes: `NOT AVAILABLE ${new Date().toISOString().slice(0, 10)} — ${reason} (pack factory, no docs)`,
    });
    logProgress({ ...job, result: 'Not Available Now', notes: reason });
    return { result: 'Not Available Now' };
  }

  const jd =
    check.description && check.description.length > 80
      ? check.description
      : `${job.position} at ${job.company}. Product management role.`;

  // Years + Lead/Global (title already gated; years from JD)
  const exp = evaluateExperience({
    description: jd,
    title: job.position,
    linkedInLevel: check.seniorityLevel || '',
  });
  if (exp.skip_for_experience) {
    const reason = `requires ${exp.experience_required} (>=${exp.max_years}y)`;
    console.log(`  not qualified — ${reason}`);
    await sheetPost({
      job_id: job.job_id,
      status: 'not qualified',
      notes: `NOT QUALIFIED ${new Date().toISOString().slice(0, 10)} — ${reason} (pack factory)`,
      experience_required: exp.experience_required,
    });
    logProgress({ ...job, result: 'NotQualified', notes: reason });
    return { result: 'NotQualified' };
  }

  // German level qualification (skip if > B2)
  const germanLevel = extractGermanRequired({ description: jd, title: job.position });
  if (shouldSkipForGerman(germanLevel, 'B2')) {
    const reason = `requires German level ${germanLevel} (>B2)`;
    console.log(`  not qualified — ${reason}`);
    await sheetPost({
      job_id: job.job_id,
      status: 'Only German Required',
      notes: `ONLY GERMAN REQUIRED ${new Date().toISOString().slice(0, 10)} — ${reason} (pack factory)`,
      german_required: germanLevel,
    });
    logProgress({ ...job, result: 'Only German Required', notes: reason });
    return { result: 'NotQualified' };
  }

  const jdFile = path.join(tmpDir, `${job.job_id}.jd.txt`);
  writeFileSync(jdFile, jd);

  const composed = await runCompose({
    jobId: job.job_id,
    company: job.company,
    role: job.position,
    jdFile,
    sheetRow: job.sheet_row,
  });

  if (composed.code !== 0) {
    console.log(`  compose failed code=${composed.code}`);
    logProgress({ ...job, result: 'ComposeFailed', notes: `exit ${composed.code}` });
    return { result: 'ComposeFailed' };
  }

  console.log(`  Ready to Apply`);
  logProgress({ ...job, result: 'Ready to Apply', notes: 'pack+R2+sheet' });
  return { result: 'Ready to Apply' };
}

async function main() {
  const csvPath = arg('csv') || '/tmp/sakshi_jobs_live.csv';
  const limit = Number(arg('limit') || 25);
  const concurrency = Math.max(1, Number(arg('concurrency') || 1));
  const startOffset = Number(arg('offset') || 0);
  const fromRow = Number(arg('from-row') || 0);
  const force = process.argv.includes('--force');
  const untriedOnly = process.argv.includes('--untried-only');

  if (!existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  const tried = untriedOnly ? loadTriedJobIds() : new Map();
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  const pending = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const sheetRow = i + 2;
    const st = (r.status || '').trim();
    // --force: re-compose Ready to Apply packs too (e.g. after bold/highlight fixes)
    if (force) {
      if (st !== 'Not Applied' && st !== 'Ready to Apply') continue;
    } else if (st !== 'Not Applied') {
      continue;
    }
    if (fromRow && sheetRow < fromRow) continue;
    if (untriedOnly && tried.has(r.job_id)) continue;
    pending.push({
      sheet_row: sheetRow,
      job_id: r.job_id,
      company: decode(r.company),
      position: decode(r.position),
      job_url: r.job_url,
    });
  }

  const fromEnd = pending.slice().reverse().slice(startOffset, startOffset + limit);
  console.log(
    `Pack factory: ${fromEnd.length} jobs from end of sheet (of ${pending.length} ${untriedOnly ? 'untried ' : ''}Not Applied${fromRow ? `, row>=${fromRow}` : ''}${force ? ', force' : ''}). concurrency=${concurrency}`,
  );
  if (fromEnd.length) {
    console.log(
      `Order: row ${fromEnd[0].sheet_row} ${fromEnd[0].company} … row ${fromEnd[fromEnd.length - 1].sheet_row}`,
    );
  }

  const tmpDir = path.join(ROOT, 'applications/queues/jd_tmp');
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  const counts = {
    'Ready to Apply': 0,
    AlreadyPacked: 0,
    'Not Available Now': 0,
    Skipped: 0,
    NotQualified: 0,
    ComposeFailed: 0,
    CheckFailed: 0,
  };

  let idx = 0;
  async function worker() {
    while (idx < fromEnd.length) {
      const my = idx++;
      const job = fromEnd[my];
      try {
        const r = await processOne(job, tmpDir, { force });
        counts[r.result] = (counts[r.result] || 0) + 1;
      } catch (e) {
        console.error(`  fatal ${job.job_id}:`, e.message);
        counts.ComposeFailed++;
        logProgress({ ...job, result: 'ComposeFailed', notes: e.message });
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  console.log('\n=== PACK FACTORY BATCH DONE ===');
  console.log(JSON.stringify(counts, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
