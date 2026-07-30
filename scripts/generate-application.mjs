#!/usr/bin/env node
/**
 * Call local resume-cv-mvp API to generate Designer resume + cover letter for a job.
 *
 * Usage:
 *   node scripts/generate-application.mjs \
 *     --job-id li_2695706 \
 *     --company FACTUREE \
 *     --role "Associate Product Manager" \
 *     --jd-file /tmp/jd.txt
 *
 * Env:
 *   RESUME_API_URL   default http://127.0.0.1:8791
 *   RESUME_API_TOKEN optional
 *   GEMINI_API_KEY   used by the API process (not this client)
 *
 * Content safety (server-side, always on):
 *   layoutLock + contentGuard reject thinned summaries/bullets/CL paragraphs
 *   so applications never ship an empty-looking resume/cover letter.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { uploadApplicationDocs } from './upload-application-docs.mjs';
import { checkLinkedInJobOpen } from './check-job-open.mjs';
import { buildFormAnswers, formAnswersToSheetString } from './form-answers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MASTER_RESUME = path.join(ROOT, 'applications/master/sakshi-resume.json');
const MASTER_CL = path.join(ROOT, 'applications/master/sakshi-cover-letter.json');

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

async function main() {
  const jobId = arg('job-id') || 'job';
  const company = arg('company') || '';
  const role = arg('role') || '';
  const jdFile = arg('jd-file');
  let jd = arg('jd') || (jdFile ? await readFile(jdFile, 'utf8') : '');

  // Always check LinkedIn availability before spending Gemini/ATS generation.
  // Skip with --skip-open-check if JD is from a non-LinkedIn source.
  if (process.env.SKIP_OPEN_CHECK !== '1' && !process.argv.includes('--skip-open-check')) {
    try {
      const check = await checkLinkedInJobOpen({ jobId, url: arg('job-url') });
      if (!check.open) {
        console.error(
          JSON.stringify(
            {
              skipped: true,
              reason: 'job_closed',
              detail: check.reason,
              jobId: check.jobId,
              message: 'Job no longer accepting applications — not generating resume/CL',
            },
            null,
            2,
          ),
        );
        // Best-effort sheet mark Not Available Now
        if (process.env.SKIP_SHEET_UPDATE !== '1') {
          try {
            await fetch(
              process.env.N8N_SAVE_DOCS_WEBHOOK ||
                'https://n8n.fineanmol.dev/webhook/save-application-docs',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'User-Agent': 'Mozilla/5.0',
                },
                body: JSON.stringify({
                  job_id: jobId,
                  status: 'Not Available Now',
                  notes: `NOT AVAILABLE — ${check.reason} (no resume/CL generated)`,
                }),
              },
            );
          } catch {
            /* ignore */
          }
        }
        process.exit(2);
      }
      if (!jd.trim() && check.description) {
        jd = check.description;
      }
      console.log('Open check → OPEN', check.title || jobId);
    } catch (err) {
      console.warn('Open check failed (continuing):', err.message);
    }
  }

  if (!jd.trim()) {
    console.error('Provide --jd or --jd-file (or a LinkedIn job that still has a description)');
    process.exit(1);
  }

  const outDir = path.resolve(
    arg('out') ||
      path.join(ROOT, 'applications/jobs', `${jobId}_${slug(company) || 'company'}`),
  );
  await mkdir(outDir, { recursive: true });

  const api = process.env.RESUME_API_URL || 'http://127.0.0.1:8791';
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.RESUME_API_TOKEN) {
    headers['x-resume-api-token'] = process.env.RESUME_API_TOKEN;
  }

  // Humanizer is ON by default (tailor → humanize → contentGuard → export).
  // Only skip with SKIP_HUMANIZE=1 for debugging.
  const skipHumanize =
    process.env.SKIP_HUMANIZE === '1' || process.argv.includes('--skip-humanize');

  const body = {
    jobId,
    company,
    role,
    jobDescription: jd,
    outputDir: outDir,
    masterResumePath: MASTER_RESUME,
    masterCoverLetterPath: MASTER_CL,
    skipHumanize,
    // Set USE_MASTER_PDFS=1 to attach website golden PDFs (no tailor in PDF).
    // Default: re-render via our Designer/CL builder (must pixel-match golden).
    ...(process.env.USE_MASTER_PDFS === '1'
      ? {
          masterResumePdfPath: path.join(ROOT, 'applications/uploads/Sakshi Product Resume.pdf'),
          masterCoverLetterPdfPath: path.join(
            ROOT,
            'applications/uploads/Sakshi Chaudhary - Cover Letter.pdf',
          ),
        }
      : {}),
  };
  console.log('Humanize →', skipHumanize ? 'OFF' : 'ON');

  const res = await fetch(`${api}/v1/generate_for_job`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(data);
    process.exit(1);
  }

  // Upload PDFs to Cloudflare R2 so the sheet stores clickable public URLs
  let resumeUrl = data.resumePdf;
  let coverLetterUrl = data.coverLetterPdf;
  let r2Meta = null;
  if (process.env.SKIP_R2_UPLOAD !== '1') {
    try {
      r2Meta = await uploadApplicationDocs({ jobId, packDir: outDir, company });
      resumeUrl = r2Meta.resumeUrl;
      coverLetterUrl = r2Meta.coverLetterUrl;
      console.log('\nR2 upload →', resumeUrl);
    } catch (err) {
      console.error('R2 upload failed (sheet will keep local paths):', err.message);
    }
  }

  const packFolderRel = path.relative(ROOT, outDir) || outDir;

  // Sheet: R2 URLs + shortlist-relevant form answers only (no contact dump)
  const formAnswers = await buildFormAnswers({ company, role });
  const sheetFields = {
    job_id: jobId,
    resume_used: resumeUrl,
    cover_letter_used: coverLetterUrl,
    resume_variant_id: data.variantId,
    ats_score: data.atsScore,
    pack_folder: packFolderRel,
    form_answers: formAnswersToSheetString(formAnswers),
  };
  if (arg('status')) sheetFields.status = arg('status');
  if (arg('applied-date')) sheetFields.applied_date = arg('applied-date');
  if (arg('notes')) sheetFields.notes = arg('notes');

  await writeFile(path.join(outDir, 'sheet_fields.json'), JSON.stringify(sheetFields, null, 2) + '\n');
  if (r2Meta) {
    await writeFile(path.join(outDir, 'r2.json'), JSON.stringify(r2Meta, null, 2) + '\n');
  }

  const webhook =
    process.env.N8N_SAVE_DOCS_WEBHOOK ||
    'https://n8n.fineanmol.dev/webhook/save-application-docs';
  if (process.env.SKIP_SHEET_UPDATE !== '1') {
    try {
      const sheetRes = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sheetFields),
      });
      const sheetBody = await sheetRes.text();
      console.log('\nSheet webhook →', sheetRes.status, sheetBody.slice(0, 500));
      if (!sheetRes.ok) {
        console.error('Sheet update failed (pack still saved locally)');
      }
    } catch (err) {
      console.error('Sheet webhook error (pack still saved locally):', err.message);
    }
  }

  console.log(JSON.stringify(data, null, 2));
  console.log('\nSheet fields →', path.join(outDir, 'sheet_fields.json'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
