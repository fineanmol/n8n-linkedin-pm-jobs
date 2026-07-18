#!/usr/bin/env node
/**
 * From the Jobs sheet (starting at a row), for each "Not Applied" job:
 *   1) Check LinkedIn if still open
 *   2) If closed → mark Expired on sheet (NO resume/CL generation)
 *   3) If open → print next open jobs (generation/apply happens separately)
 *
 * Usage:
 *   node scripts/screen-and-apply-queue.mjs --from-row 589 --limit 20
 *   node scripts/screen-and-apply-queue.mjs --from-row 589 --limit 20 --mark-expired
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { parse } from 'node:path';
import { checkLinkedInJobOpen } from './check-job-open.mjs';

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
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

async function markExpired(jobId, reason) {
  const payload = {
    job_id: jobId,
    status: 'Expired',
    notes: `EXPIRED ${new Date().toISOString().slice(0, 10)} — ${reason} (no resume/CL generated)`,
  };
  const res = await fetch(
    process.env.N8N_SAVE_DOCS_WEBHOOK ||
      'https://n8n.fineanmol.dev/webhook/save-application-docs',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      body: JSON.stringify(payload),
    },
  );
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 200) };
}

async function main() {
  const fromRow = Number(arg('from-row') || 589);
  const limit = Number(arg('limit') || 25);
  const mark = hasFlag('mark-expired');
  const csvPath = arg('csv') || '/tmp/jobs_sheet.csv';

  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  // sheet row N => data index N-2
  const slice = rows.slice(fromRow - 2);
  const queue = [];
  for (let i = 0; i < slice.length; i++) {
    const r = slice[i];
    if ((r.status || '').trim() !== 'Not Applied') continue;
    queue.push({
      sheet_row: fromRow + i,
      job_id: r.job_id,
      company: r.company,
      position: (r.position || '').replace(/&amp;/g, '&'),
      job_url: r.job_url,
    });
    if (queue.length >= limit) break;
  }

  console.log(`Screening ${queue.length} Not Applied jobs from row ${fromRow}...`);
  const open = [];
  const closed = [];

  for (const job of queue) {
    const check = await checkLinkedInJobOpen({ jobId: job.job_id, url: job.job_url });
    const item = { ...job, ...check };
    if (check.open) {
      open.push(item);
      console.log(`OPEN   row ${job.sheet_row} | ${job.company} | ${job.position.slice(0, 50)}`);
    } else {
      closed.push(item);
      console.log(`CLOSED row ${job.sheet_row} | ${job.company} | ${check.reason}`);
      if (mark) {
        // Prefer sheet job_id as stored (may be with/without li_)
        const ids = [job.job_id];
        if (String(job.job_id).startsWith('li_')) ids.push(String(job.job_id).slice(3));
        else ids.push(`li_${job.job_id}`);
        for (const id of ids) {
          const r = await markExpired(id, check.reason);
          if (r.status < 400) {
            console.log(`  → marked Expired (${id})`);
            break;
          }
        }
      }
    }
    // be polite to LinkedIn guest API
    await new Promise((r) => setTimeout(r, 400));
  }

  const summary = {
    screened: queue.length,
    open: open.length,
    closed: closed.length,
    openJobs: open,
    closedJobs: closed.map((j) => ({
      sheet_row: j.sheet_row,
      job_id: j.job_id,
      company: j.company,
      reason: j.reason,
    })),
  };
  writeFileSync('/tmp/screen_result.json', JSON.stringify(summary, null, 2));
  console.log(`\nSummary: ${open.length} open, ${closed.length} closed (no generate for closed)`);
  console.log('Wrote /tmp/screen_result.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
