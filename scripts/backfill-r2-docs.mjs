#!/usr/bin/env node
/**
 * Upload existing local application packs to R2 and patch the Jobs sheet
 * so resume_used / cover_letter_used are public HTTPS URLs.
 *
 * Usage:
 *   node scripts/backfill-r2-docs.mjs
 *   node scripts/backfill-r2-docs.mjs --job-id li_4433195439
 */
import { readdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { uploadApplicationDocs } from './upload-application-docs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const JOBS_DIR = path.join(ROOT, 'applications/jobs');
const WEBHOOK =
  process.env.N8N_SAVE_DOCS_WEBHOOK ||
  'https://n8n.fineanmol.dev/webhook/save-application-docs';

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function packsToProcess(onlyJobId) {
  const dirs = await readdir(JOBS_DIR, { withFileTypes: true });
  const packs = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const packDir = path.join(JOBS_DIR, d.name);
    if (!(await exists(path.join(packDir, 'resume.pdf')))) continue;
    if (!(await exists(path.join(packDir, 'cover_letter.pdf')))) continue;
    const jobId = d.name.split('_').slice(0, 2).join('_').startsWith('li_')
      ? d.name.match(/^(li_\d+)/)?.[1]
      : d.name.split('_')[0];
    const id = jobId || d.name;
    if (onlyJobId && id !== onlyJobId && d.name !== onlyJobId) continue;
    packs.push({ jobId: id, packDir, folderName: d.name });
  }
  return packs;
}

async function main() {
  const only = arg('job-id');
  const packs = await packsToProcess(only);
  if (!packs.length) {
    console.error('No packs found to upload');
    process.exit(1);
  }

  for (const pack of packs) {
    console.log(`\n→ ${pack.jobId} (${pack.folderName})`);
    let company;
    try {
      const meta = JSON.parse(
        await readFile(path.join(pack.packDir, 'meta.json'), 'utf8'),
      );
      company = meta.company;
    } catch {
      /* resolve from folder inside upload */
    }
    const uploaded = await uploadApplicationDocs({
      jobId: pack.jobId,
      packDir: pack.packDir,
      company,
    });
    console.log(`  → ${uploaded.resumeFile} / ${uploaded.coverLetterFile}`);
    await writeFile(
      path.join(pack.packDir, 'r2.json'),
      JSON.stringify(uploaded, null, 2) + '\n',
    );

    let sheetFields = {
      job_id: pack.jobId,
      resume_used: uploaded.resumeUrl,
      cover_letter_used: uploaded.coverLetterUrl,
      pack_folder: path.relative(ROOT, pack.packDir),
      notes: `R2 docs ${new Date().toISOString().slice(0, 10)} | resume: ${uploaded.resumeUrl} | cl: ${uploaded.coverLetterUrl}`,
    };

    const localSheet = path.join(pack.packDir, 'sheet_fields.json');
    if (await exists(localSheet)) {
      try {
        const prev = JSON.parse(await readFile(localSheet, 'utf8'));
        sheetFields = {
          ...prev,
          ...sheetFields,
          // keep prior status/ats/etc; overwrite URLs
          resume_used: uploaded.resumeUrl,
          cover_letter_used: uploaded.coverLetterUrl,
          pack_folder: path.relative(ROOT, pack.packDir),
          notes:
            prev.notes && !String(prev.notes).includes(uploaded.resumeUrl)
              ? `${prev.notes} | r2:${uploaded.resumeUrl}`
              : prev.notes || sheetFields.notes,
        };
      } catch {
        /* ignore bad sidecar */
      }
    }

    const atsScore =
      sheetFields.ats_score ??
      sheetFields.atsScore ??
      null;
    console.log(
      `  ats_score → ${atsScore != null && atsScore !== '' ? atsScore : 'n/a'}`,
    );

    await writeFile(localSheet, JSON.stringify(sheetFields, null, 2) + '\n');

    if (process.env.SKIP_SHEET_UPDATE === '1') {
      console.log('  skipped sheet update');
      continue;
    }

    const res = await fetch(WEBHOOK, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      body: JSON.stringify(sheetFields),
    });
    const body = await res.text();
    console.log('  sheet →', res.status, body.slice(0, 240));
  }

  console.log(`\nDone. Uploaded ${packs.length} pack(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
