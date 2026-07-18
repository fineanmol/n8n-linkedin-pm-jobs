#!/usr/bin/env node
/**
 * Backfill `german_required` for Not Applied / Ready to Apply rows.
 * Marks >B2 as status "Only German Required".
 *
 *   node scripts/backfill-german-required.mjs --csv /tmp/sakshi_jobs_live.csv
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLinkedInJobOpen } from './check-job-open.mjs';
import {
  extractGermanRequired,
  shouldSkipForGerman,
} from './extract-german-required.mjs';

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

async function updateSheet(payload, dryRun) {
  if (dryRun) return { ok: true, dryRun: true };
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
  return { ok: res.ok, status: res.status, body: text.slice(0, 200) };
}

async function main() {
  const csvPath = arg('csv') || '/tmp/sakshi_jobs_live.csv';
  const limit = Number(arg('limit') || 0) || Infinity;
  const delayMs = Number(arg('delay-ms') || 1100);
  const dryRun = process.argv.includes('--dry-run');
  const maxLevel = arg('max-german') || 'B2';
  const statusFilter = (arg('status') || 'Not Applied,Ready to Apply')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const rows = parseCsv(await readFile(csvPath, 'utf8'));
  const targets = rows.filter((r) => {
    const st = (r.status || '').trim();
    if (!statusFilter.includes(st)) return false;
    if ((r.german_required || '').trim()) return false;
    if (!(r.job_id || '').startsWith('li_')) return false;
    return true;
  });

  console.log(
    `Backfill german_required: ${Math.min(targets.length, limit)} of ${targets.length} (max=${maxLevel}) dryRun=${dryRun}`,
  );

  const logDir = path.join(ROOT, 'applications/queues');
  await mkdir(logDir, { recursive: true });
  const logPath = path.join(logDir, 'german_backfill.jsonl');

  let done = 0;
  let ok = 0;
  let fail = 0;
  let disqualified = 0;
  const counts = {};

  for (const row of targets.slice(0, limit)) {
    done++;
    const jobId = row.job_id.trim();
    process.stdout.write(
      `\n▶ ${done}. ${jobId} | ${row.company} | ${(row.position || '').slice(0, 50)}\n`,
    );
    try {
      const check = await checkLinkedInJobOpen({ jobId });
      const german_required = extractGermanRequired({
        description: check.description || '',
        title: check.title || row.position || '',
      });
      counts[german_required] = (counts[german_required] || 0) + 1;
      const skip = shouldSkipForGerman(german_required, maxLevel);
      console.log(
        `  → ${german_required}${skip ? ' [>B2 → Only German Required]' : ''} (jd ${check.descriptionLength || 0})`,
      );

      const payload = {
        job_id: jobId,
        german_required,
      };
      if (skip) {
        payload.status = 'Only German Required';
        payload.notes = `Auto: German ${german_required} required (max ${maxLevel})`;
        disqualified++;
      }

      const sheet = await updateSheet(payload, dryRun);
      if (sheet.ok) ok++;
      else {
        fail++;
        console.log('  sheet fail', sheet.status, sheet.body);
      }
      await writeFile(
        logPath,
        JSON.stringify({
          job_id: jobId,
          german_required,
          skip,
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

  console.log('\n=== GERMAN BACKFILL DONE ===');
  console.log(JSON.stringify({ done, ok, fail, disqualified, counts }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
