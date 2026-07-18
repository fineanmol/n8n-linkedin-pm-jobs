#!/usr/bin/env node
/**
 * Backfill Jobs sheet column `experience_required` for open/unapplied rows.
 *
 * Uses LinkedIn guest JD + regex extract (no OpenAI). Sheet column is created
 * automatically via save-application-docs (handlingExtraData=insertInNewColumn).
 *
 * Usage:
 *   node scripts/backfill-experience-required.mjs --csv /tmp/sakshi_jobs_live.csv
 *   node scripts/backfill-experience-required.mjs --csv ... --limit 50 --status "Not Applied"
 *   node scripts/backfill-experience-required.mjs --csv ... --dry-run
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLinkedInJobOpen } from './check-job-open.mjs';
import { extractExperienceRequired } from './extract-experience-required.mjs';

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
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
      continue;
    }
    if (ch === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function updateSheet(jobId, experienceRequired, dryRun) {
  const body = {
    job_id: jobId,
    experience_required: experienceRequired,
    notes: '', // dropped if empty by webhook; keep schema happy
  };
  if (dryRun) return { ok: true, dryRun: true };
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text.slice(0, 200) };
}

async function main() {
  const csvPath = arg('csv') || '/tmp/sakshi_jobs_live.csv';
  const limit = Number(arg('limit') || 0) || Infinity;
  const delayMs = Number(arg('delay-ms') || 1200);
  const dryRun = process.argv.includes('--dry-run');
  const statusFilter = (arg('status') || 'Not Applied,Ready to Apply')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const rows = parseCsv(await readFile(csvPath, 'utf8'));
  const targets = rows.filter((r) => {
    const st = (r.status || '').trim();
    if (!statusFilter.includes(st)) return false;
    if ((r.experience_required || '').trim()) return false;
    if (!(r.job_id || '').startsWith('li_')) return false;
    return true;
  });

  console.log(
    `Backfill experience_required: ${Math.min(targets.length, limit)} of ${targets.length} candidates (statuses: ${statusFilter.join(', ')}) dryRun=${dryRun}`,
  );

  const logDir = path.join(ROOT, 'applications/queues');
  await mkdir(logDir, { recursive: true });
  const logPath = path.join(logDir, 'experience_backfill.jsonl');

  let done = 0;
  let ok = 0;
  let fail = 0;
  const counts = {};

  for (const row of targets.slice(0, limit)) {
    done++;
    const jobId = row.job_id.trim();
    process.stdout.write(`\n▶ ${done}. ${jobId} | ${row.company} | ${(row.position || '').slice(0, 50)}\n`);
    try {
      const check = await checkLinkedInJobOpen({ jobId });
      const experience_required = extractExperienceRequired({
        description: check.description || '',
        title: check.title || row.position || '',
        linkedInLevel: check.seniorityLevel || '',
      });
      counts[experience_required] = (counts[experience_required] || 0) + 1;
      console.log(`  → ${experience_required} (jd ${check.descriptionLength || 0} chars, open=${check.open})`);

      const sheet = await updateSheet(jobId, experience_required, dryRun);
      if (sheet.ok) ok++;
      else {
        fail++;
        console.log('  sheet fail', sheet.status, sheet.body);
      }
      await writeFile(
        logPath,
        JSON.stringify({
          job_id: jobId,
          experience_required,
          open: check.open,
          sheet_ok: sheet.ok,
          at: new Date().toISOString(),
        }) + '\n',
        { flag: 'a' },
      );
    } catch (e) {
      fail++;
      console.log('  error', e.message);
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  console.log('\n=== EXPERIENCE BACKFILL DONE ===');
  console.log(JSON.stringify({ done, ok, fail, counts }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
