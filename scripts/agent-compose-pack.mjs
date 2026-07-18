#!/usr/bin/env node
/**
 * Composer-inline pack builder (no Gemini).
 * Light truth-bound tailor → ATS≥90 → designer PDF export → R2 → sheet.
 *
 * Layout is locked by resume-cv-mvp `/v1/export_pdfs` (sanitizeResumeForExport).
 *
 * Usage:
 *   node scripts/agent-compose-pack.mjs \
 *     --job-id li_xxx --company "..." --role "..." --jd-file /tmp/jd.txt \
 *     [--sheet-row N] [--skip-r2] [--skip-sheet]
 *
 * Programmatic:
 *   import { composePack } from './agent-compose-pack.mjs'
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { uploadApplicationDocs } from './upload-application-docs.mjs';
import { buildFormAnswers, formAnswersToSheetString } from './form-answers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** Single source of truth for YOE wording on resume + cover letter (keep in sync). */
export const APPLICANT_YOE = '3.5+';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
export function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}
function noEmDash(s) {
  return String(s || '')
    .replace(/\u2014/g, ', ')
    .replace(/\u2013/g, '-')
    .replace(/\s+-\s+/g, ' - ');
}

function extractKeywords(jd) {
  const text = String(jd || '').toLowerCase();
  const catalog = [
    ['product owner', 'Product Owner'],
    ['product manager', 'Product Manager'],
    ['product lead', 'Product Lead'],
    ['roadmap', 'Roadmaps'],
    ['backlog', 'Backlog'],
    ['agile', 'Agile'],
    ['scrum', 'Scrum'],
    ['kanban', 'Kanban'],
    ['stakeholder', 'Stakeholder Management'],
    ['sql', 'SQL'],
    ['a/b', 'A/B Testing'],
    ['experiment', 'Experimentation'],
    ['pricing', 'Pricing'],
    ['market research', 'Market Research'],
    ['go-to-market', 'GTM'],
    ['gtm', 'GTM'],
    ['saas', 'SaaS'],
    ['b2b', 'B2B'],
    ['crm', 'CRM'],
    ['salesforce', 'Salesforce'],
    ['api', 'API'],
    ['kpi', 'KPIs'],
    ['analytics', 'Analytics'],
    ['figma', 'Figma'],
    ['jira', 'JIRA'],
    ['magento', 'Magento'],
    ['loyalty', 'Loyalty'],
    ['fintech', 'Fintech'],
    ['ai ', 'AI'],
    ['machine learning', 'ML'],
    ['commerce', 'E-commerce'],
    ['e-commerce', 'E-commerce'],
    ['logistics', 'Logistics'],
    ['learning', 'Learning Experience'],
    ['paid search', 'Paid Search'],
    ['martech', 'Martech'],
    ['marketplace', 'Marketplace'],
    ['acquisition', 'Customer Acquisition'],
    ['seo', 'SEO'],
    ['prioriti', 'Prioritization'],
    ['experimentation', 'Experimentation'],
  ];
  const hits = [];
  for (const [needle, label] of catalog) {
    if (text.includes(needle) && !hits.includes(label)) hits.push(label);
  }
  return hits.slice(0, 8);
}

function tailorResume(master, { company, role, jd }) {
  const resume = structuredClone(master);
  const kws = extractKeywords(jd);
  const roleLower = (role || '').toLowerCase();
  let focus = 'Product Management';
  if (roleLower.includes('owner')) focus = 'Product Ownership';
  else if (roleLower.includes('marketing')) focus = 'Product Marketing';
  else if (roleLower.includes('commercial')) focus = 'Commercialization & Portfolio';
  else if (roleLower.includes('lead')) focus = 'Product Leadership';

  resume.subtitle = noEmDash(
    `Product Manager | ${focus} | Agile & Strategy`,
  );
  const kwPhrase = kws.length
    ? ` Relevant strengths for this role include ${kws.slice(0, 5).join(', ')}.`
    : '';
  resume.resumeSummary = noEmDash(
    `Results-driven Product Manager with ${APPLICANT_YOE} years managing B2B product lifecycles from discovery through delivery. Skilled in market analysis, backlog prioritization, release planning, and cross-functional collaboration with engineering, design, sales, and operations.${kwPhrase} Analytical mindset with SQL/Power BI experience and a focus on shipping improvements that move business outcomes.`,
  );

  const skills = resume.resumeSkills.split(',').map((s) => s.trim()).filter(Boolean);
  const prefer = [...kws, 'Product Strategy', 'MVP', 'Scrum', 'Stakeholder Management', 'SQL', 'Market Research', 'JIRA', 'A/B Testing'];
  const ordered = [];
  for (const p of prefer) {
    const hit = skills.find(
      (s) => s.toLowerCase() === p.toLowerCase() || s.toLowerCase().includes(p.toLowerCase()),
    );
    if (hit && !ordered.includes(hit)) ordered.push(hit);
  }
  for (const s of skills) if (!ordered.includes(s)) ordered.push(s);
  resume.resumeSkills = ordered.join(', ');

  // Keep master bullet density (contentGuard); light cleanup only — no thinning
  resume.resumeExperience = (master.resumeExperience || []).map((job) => ({
    ...job,
    bullets: noEmDash(String(job.bullets || ''))
      .replace(/\*\*/g, '')
      .replace(/accelerating Saas/gi, 'accelerating SaaS')
      .replace(/1\.000/g, '1,000'),
  }));

  // Never drop photo
  resume.avatar = master.avatar || resume.avatar;
  resume.layoutSettings = {
    ...(master.layoutSettings || {}),
    ...(resume.layoutSettings || {}),
    showPhoto: true,
  };

  return { resume, keywords: kws, focus };
}

function tailorCoverLetter(master, { company, role, jd, keywords, focus }) {
  const cl = structuredClone(master);
  cl.companyName = company;
  cl.jobTitle = role;
  cl.salutation = `To the Hiring Team at ${company},`;
  const theme = keywords.slice(0, 3).join(', ') || focus;
  // Keep master CL density; only swap company/role + light theme line
  cl.p1 = noEmDash(
    String(master.p1 || '')
      .replaceAll('{{role}}', role)
      .replaceAll('{{company}}', company)
      .replace(/I am writing to express my keen interest/i, 'I am writing to apply'),
  );
  if (!cl.p1 || cl.p1.includes('{{')) {
    cl.p1 = noEmDash(
      `I am writing to apply for the ${role} role at ${company}. With ${APPLICANT_YOE} years of experience in product, market analysis, and agile execution, along with a Master's degree in International Management (specialization in Product Management & Strategy) from Berlin, I bring a unique blend of strategic thinking, customer-centric approach, and passion for technology.`,
    );
  } else {
    // Keep CL YOE aligned with resume if master template still says "3+"
    cl.p1 = cl.p1.replace(/\b3\+\s*years\b/gi, `${APPLICANT_YOE} years`);
  }
  cl.p2 = noEmDash(String(master.p2 || cl.p2));
  cl.p3 = noEmDash(
    `What excites me most about this ${role} opportunity is how it connects ${theme} with real customer and business outcomes. I am passionate about shipping products that solve real problems and move metrics, and I would love to bring my experimentation mindset, analytical toolkit, and cross-functional leadership to the team at ${company}.`,
  );
  cl.p4 = noEmDash(
    `Thank you for your consideration. I am based in Berlin, available for interviews soon, can start immediately, and hold a valid work permit to work full-time in Germany. I look forward to speaking with you.`,
  );
  cl.highlights = (master.highlights || []).map((h) => ({
    ...h,
    text: noEmDash(String(h.text || '')),
  }));
  cl.avatar = master.avatar || cl.avatar;
  cl.layoutSettings = {
    ...(master.layoutSettings || {}),
    ...(cl.layoutSettings || {}),
    showPhoto: true,
  };
  return cl;
}

/**
 * Layout-safe pack compose used by CLI, HTTP service, and pack factory.
 * PDFs always go through resume-cv-mvp designer export (frozen layout).
 */
export async function composePack(opts = {}) {
  const jobId = String(opts.jobId || opts.job_id || '').trim();
  const company = String(opts.company || '').trim();
  const role = String(opts.role || opts.position || '').trim();
  const jd = String(opts.jd || opts.jobDescription || opts.job_description || '').trim();
  const skipR2 = Boolean(opts.skipR2 || opts.skip_r2);
  const skipSheet = Boolean(opts.skipSheet || opts.skip_sheet);
  const status = String(opts.status || 'Ready to Apply');
  const atsTarget = String(opts.atsTarget || opts.ats_target || '90');

  if (!jobId) throw new Error('job_id is required');
  if (!jd) throw new Error('jd (job description) is required');
  if (!company) throw new Error('company is required');
  if (!role) throw new Error('role is required');

  const outDir = path.resolve(
    opts.outDir ||
      opts.out ||
      path.join(ROOT, 'applications/jobs', `${jobId}_${slug(company) || 'company'}`),
  );
  await mkdir(outDir, { recursive: true });

  const masterResume = JSON.parse(
    await readFile(path.join(ROOT, 'applications/master/sakshi-resume.json'), 'utf8'),
  );
  const masterCl = JSON.parse(
    await readFile(path.join(ROOT, 'applications/master/sakshi-cover-letter.json'), 'utf8'),
  );

  const { resume, keywords, focus } = tailorResume(masterResume, { company, role, jd });
  const coverLetter = tailorCoverLetter(masterCl, { company, role, jd, keywords, focus });

  await writeFile(path.join(outDir, 'resume.json'), JSON.stringify(resume, null, 2));
  await writeFile(path.join(outDir, 'cover_letter.json'), JSON.stringify(coverLetter, null, 2));

  const jdTmp = path.join(outDir, 'jd.txt');
  await writeFile(jdTmp, jd);
  const { spawnSync } = await import('node:child_process');
  const boost = spawnSync(
    process.execPath,
    [
      path.join(ROOT, 'scripts/boost-ats.mjs'),
      '--pack-dir',
      outDir,
      '--jd-file',
      jdTmp,
      '--target',
      atsTarget,
    ],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (boost.stdout) console.log(boost.stdout);
  if (boost.status !== 0) {
    const detail = (boost.stderr || boost.stdout || '').slice(0, 800);
    throw new Error(`ATS boost failed (need >=${atsTarget}): ${detail || boost.status}`);
  }
  let atsScore = Number(atsTarget) || 90;
  const boostOut = boost.stdout || '';
  const atsJsonMatch = boostOut.match(/\{\s*"atsScore"\s*:\s*(\d+)/);
  if (atsJsonMatch) atsScore = Number(atsJsonMatch[1]);

  const exported = {
    resumePdf: path.join(outDir, 'resume.pdf'),
    coverLetterPdf: path.join(outDir, 'cover_letter.pdf'),
  };
  console.log('PDF export OK (ATS>=90)', exported.resumePdf, 'ats', atsScore);

  const boostedResume = JSON.parse(await readFile(path.join(outDir, 'resume.json'), 'utf8'));
  Object.assign(resume, boostedResume);
  const boostedCl = JSON.parse(await readFile(path.join(outDir, 'cover_letter.json'), 'utf8'));
  Object.assign(coverLetter, boostedCl);

  let resumeUrl = exported.resumePdf;
  let coverLetterUrl = exported.coverLetterPdf;
  let r2Meta = null;
  if (!skipR2) {
    r2Meta = await uploadApplicationDocs({ jobId, packDir: outDir, company });
    resumeUrl = r2Meta.resumeUrl;
    coverLetterUrl = r2Meta.coverLetterUrl;
    await writeFile(path.join(outDir, 'r2.json'), JSON.stringify(r2Meta, null, 2));
    console.log('R2', resumeUrl);
  }

  const formAnswers = await buildFormAnswers({ company, role, portal: 'Composer-inline pack' });
  const sheetFields = {
    job_id: jobId,
    status,
    resume_used: resumeUrl,
    cover_letter_used: coverLetterUrl,
    resume_variant_id: `${slug(company)}_${slug(role)}_composer_${new Date().toISOString().slice(0, 10)}`,
    ats_score: atsScore,
    pack_folder: path.relative(ROOT, outDir),
    form_answers: formAnswersToSheetString(formAnswers),
    notes: `Pack ready (ATS ${atsScore}). Manual apply. Keywords: ${keywords.join(', ') || 'general PM'}`,
  };
  if (opts.sheetRow || opts.sheet_row) {
    sheetFields.sheet_row = Number(opts.sheetRow || opts.sheet_row);
  }
  await writeFile(path.join(outDir, 'sheet_fields.json'), JSON.stringify(sheetFields, null, 2));
  await writeFile(
    path.join(outDir, 'meta.json'),
    JSON.stringify(
      {
        jobId,
        company,
        role,
        aiProvider: 'composer-inline',
        atsScore,
        keywords,
        generatedAt: new Date().toISOString(),
        resumePdf: exported.resumePdf,
        coverLetterPdf: exported.coverLetterPdf,
      },
      null,
      2,
    ),
  );

  let sheetStatus = null;
  if (!skipSheet) {
    const res = await fetch(
      process.env.N8N_SAVE_DOCS_WEBHOOK ||
        'https://n8n.fineanmol.dev/webhook/save-application-docs',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: JSON.stringify(sheetFields),
      },
    );
    const sheetBody = await res.text();
    sheetStatus = res.status;
    console.log('Sheet', res.status, sheetBody.slice(0, 180));
  }

  return {
    ok: true,
    jobId,
    company,
    role,
    outDir,
    pack_folder: sheetFields.pack_folder,
    resumeUrl,
    coverLetterUrl,
    ats_score: atsScore,
    keywords,
    status,
    sheetStatus,
    layout: 'designer-locked',
  };
}

async function main() {
  const jobId = arg('job-id');
  const jdFile = arg('jd-file');
  if (!jobId || !jdFile) {
    console.error('Need --job-id and --jd-file');
    process.exit(1);
  }
  const jd = await readFile(jdFile, 'utf8');
  const result = await composePack({
    jobId,
    company: arg('company') || '',
    role: arg('role') || '',
    jd,
    status: arg('status') || 'Ready to Apply',
    sheetRow: arg('sheet-row'),
    outDir: arg('out'),
    skipR2: process.argv.includes('--skip-r2'),
    skipSheet: process.argv.includes('--skip-sheet'),
  });
  console.log(JSON.stringify(result, null, 2));
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
