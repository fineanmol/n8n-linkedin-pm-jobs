#!/usr/bin/env node
/**
 * Agent / Composer inline path when Gemini quota is exhausted and CURSOR_API_KEY
 * is not available for `cursor agent` CLI.
 *
 * Expects stdin JSON:
 *   { company, role, jobDescription, resume, coverLetter, skipHumanize? }
 *
 * This script does NOT call an LLM — it writes a prompt pack the calling agent
 * should fulfill, OR if COMPOSED_JSON_PATH is set, merges that composed patch
 * and exports PDFs via the resume API.
 *
 * Usage (agent fills patches):
 *   1) node scripts/compose-application-inline.mjs --prepare --out /tmp/compose_pack
 *      → writes tailor_prompt.txt + humanize_prompt.txt + masters
 *   2) Agent (Composer) produces tailored+humanized resume/cover JSON
 *   3) node scripts/compose-application-inline.mjs --export \
 *        --resume-json ... --cl-json ... --out-dir applications/jobs/...
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API = process.env.RESUME_API_URL || 'http://127.0.0.1:8791';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  if (process.argv.includes('--export')) {
    const resume = JSON.parse(await readFile(arg('resume-json'), 'utf8'));
    const coverLetter = JSON.parse(await readFile(arg('cl-json'), 'utf8'));
    const outputDir = path.resolve(arg('out-dir'));
    await mkdir(outputDir, { recursive: true });
    const res = await fetch(`${API}/v1/export_pdfs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume, coverLetter, outputDir }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(data);
      process.exit(1);
    }
    await writeFile(path.join(outputDir, 'resume.json'), JSON.stringify(resume, null, 2));
    await writeFile(
      path.join(outputDir, 'cover_letter.json'),
      JSON.stringify(coverLetter, null, 2),
    );
    await writeFile(
      path.join(outputDir, 'meta.json'),
      JSON.stringify(
        {
          aiProvider: 'composer-inline',
          generatedAt: new Date().toISOString(),
          resumePdf: data.resumePdf,
          coverLetterPdf: data.coverLetterPdf,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.error(
    'Use --export with --resume-json --cl-json --out-dir after Composer produces tailored JSON.',
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
