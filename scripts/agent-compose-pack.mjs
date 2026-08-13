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
import {
  loadTruthLexicon,
  extractTruthSkillsFromJd,
} from './truth-lexicon.mjs';

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
  // Pull truth-lexicon JD skills so tailor is JD-heavy before boost runs
  const truthKws = extractTruthSkillsFromJd(
    jd,
    loadTruthLexicon({ masterResume: master }),
  )
    .map((t) => t.label)
    .filter((l) => !/^(Product Manager|Product Owner|Product Lead)$/i.test(l));
  const themes = [];
  for (const t of [...truthKws, ...kws]) {
    if (!themes.some((x) => x.toLowerCase() === t.toLowerCase())) themes.push(t);
  }
  const roleLower = (role || '').toLowerCase();
  const jdLower = String(jd || '').toLowerCase();
  let focus = 'Product Management';
  if (roleLower.includes('owner') || /\bproduct owner\b/.test(jdLower)) {
    focus = 'Product Ownership';
  } else if (roleLower.includes('marketing')) focus = 'Product Marketing';
  else if (roleLower.includes('commercial')) focus = 'Commercialization & Portfolio';
  else if (roleLower.includes('analyst')) focus = 'Product Analytics';
  else if (roleLower.includes('growth')) focus = 'Growth Product';
  else if (roleLower.includes('technical')) focus = 'Technical Product';
  else if (roleLower.includes('lead')) focus = 'Product Leadership';

  // Headline: Product Manager | {Ownership/…} | {JD ATS signal}
  // Prefer stack/domain from JD, else Cross-functional (strong generic ATS for PO/PM).
  const stackRank = ['Salesforce', 'SAP', 'ERP', 'AWS', 'Azure', 'AI', 'Cloud', 'CRM'];
  const stackTheme = stackRank.find((s) =>
    themes.some((t) => t.toLowerCase() === s.toLowerCase()),
  );
  const hasCross =
    themes.some((t) => /cross[- ]functional/i.test(t)) ||
    /cross[- ]functional|schnittstellen|übergreifend|cross functional/.test(jdLower);
  let headlineTheme =
    stackTheme ||
    (hasCross ? 'Cross-functional' : null) ||
    themes.find((t) =>
      /^(Stakeholder Management|Agile|Scrum|Kanban|Roadmaps|Backlog)$/i.test(t),
    ) ||
    (focus === 'Product Ownership' ? 'Cross-functional' : null) ||
    themes.find((t) => !/^(product manager|product owner|sql|analytics)$/i.test(t)) ||
    'Agile & Strategy';
  resume.subtitle = noEmDash(`Product Manager | ${focus} | ${headlineTheme}`);

  // Concise, domain-tailored 4-line summary (320-370 chars) to guarantee 1-page fit
  const domainFocus = stackTheme || focus || 'B2B & SaaS';
  resume.resumeSummary = noEmDash(
    `Results-driven Product Manager with 3.5+ years of experience in managing product lifecycles, cross-functional execution, and market analysis. Proven track record in translating customer and business requirements into clear roadmaps, prioritizing high-impact features, and driving data-driven product decisions to scale ${domainFocus.toLowerCase()} products.`
  );

  // Master skills as base. Only JD-matched themes move to the front — no hardcoded
  // Product Strategy / Requirement Gathering bump on every pack.
  const skills = resume.resumeSkills.split(',').map((s) => s.trim()).filter(Boolean);
  const jdPrefer = [];
  for (const p of [...themes, ...kws]) {
    if (!p || jdPrefer.some((x) => x.toLowerCase() === p.toLowerCase())) continue;
    jdPrefer.push(p);
  }
  const ordered = [];
  for (const p of jdPrefer) {
    const hit = skills.find(
      (s) => s.toLowerCase() === p.toLowerCase() || s.toLowerCase().includes(p.toLowerCase()),
    );
    if (hit && !ordered.includes(hit)) ordered.push(hit);
    else if (
      !ordered.some((o) => o.toLowerCase() === p.toLowerCase()) &&
      p.length > 2 &&
      themes.some((t) => t.toLowerCase() === p.toLowerCase())
    ) {
      // add JD theme chip only if truth extractor found it in this JD
      ordered.push(p);
    }
  }
  // Keep remaining master skills in master order
  for (const s of skills) if (!ordered.includes(s)) ordered.push(s);
  resume.resumeSkills = ordered.slice(0, 40).join(', ');

  // Master bullets kept as-is. JD terms go into skills chips (+ headline) — ATS reads those.
  // Do not duplicate skills already on the chips into experience bullets.
  resume.resumeExperience = (master.resumeExperience || []).map((job) => ({
    ...job,
    bullets: noEmDash(String(job.bullets || ''))
      .replace(/\*\*/g, '')
      .replace(/accelerating Saas/gi, 'accelerating SaaS')
      .replace(/1\.000/g, '1,000'),
  }));
  if (Array.isArray(resume.resumeAchievements)) {
    resume.resumeAchievements = resume.resumeAchievements.map((ach) => ({
      ...ach,
      title: noEmDash(String(ach.title || '').replace(/\*\*/g, '')),
      desc: noEmDash(String(ach.desc || '').replace(/\*\*/g, '')),
    }));
  }
  if (resume.resumeSummary) {
    resume.resumeSummary = noEmDash(String(resume.resumeSummary).replace(/\*\*/g, ''));
  }

  // Never drop photo
  resume.avatar = master.avatar || resume.avatar;
  resume.layoutSettings = {
    ...(master.layoutSettings || {}),
    ...(resume.layoutSettings || {}),
    showPhoto: true,
  };

  return { resume, keywords: themes.length ? themes : kws, focus };
}

function tailorCoverLetter(master, { company, role, jd, keywords, focus }) {
  const cl = structuredClone(master);
  cl.companyName = company;
  cl.jobTitle = role;
  cl.salutation = `To the Hiring Team at ${company},`;
  const roleLower = String(role || '').toLowerCase();
  const jdLower = String(jd || '').toLowerCase();
  const isPmm = roleLower.includes('marketing') || jdLower.includes('product marketing');
  const isAi = /\bai\b|machine learning|\bllm\b|generative/.test(`${roleLower} ${jdLower}`);

  const fill = (s) =>
    noEmDash(
      String(s || '')
        .replaceAll('{{role}}', role)
        .replaceAll('{{company}}', company)
        .replace(/\b3\+\s*years\b/gi, `${APPLICANT_YOE} years`)
        .replace(/\bInc\.\./g, 'Inc.')
        .replace(/\bapply in the\b/i, 'apply for the'),
    );

  cl.p1 = fill(master.p1);
  if (!cl.p1 || cl.p1.includes('{{')) {
    cl.p1 = noEmDash(
      `I am writing to apply for the ${role} role at ${company}. With ${APPLICANT_YOE} years of experience in product, market analysis, and agile execution, along with a Master's in International Management (Product Management & Strategy) from Berlin, I bring strategic thinking, a customer-centric approach, and a practical bias for measurable outcomes.`,
    );
  } else {
    cl.p1 = cl.p1.replace(/I am writing to express my keen interest/i, 'I am writing to apply');
  }

  // Keep master density — do not thin p2.
  cl.p2 = fill(master.p2 || cl.p2);

  // Dense, role-aware interest paragraph (master floor ~340+ chars).
  if (isPmm && isAi) {
    cl.p3 = noEmDash(
      `What draws me to the ${role} role at ${company} is the mix of product storytelling, technical credibility, and go-to-market craft around data and AI products. I enjoy turning research, enablement, and customer feedback into clearer positioning and better product decisions, and I would welcome the chance to bring that experimentation mindset and cross-functional habit to your team.`,
    );
  } else if (isPmm) {
    cl.p3 = noEmDash(
      `What draws me to the ${role} role at ${company} is the chance to connect product value with clear market messaging and partner enablement. I like roles where research, training, and feedback loops turn into sharper GTM decisions, and I would welcome contributing that analytical, customer-close approach on your team.`,
    );
  } else {
    const themeBits = keywords
      .filter((k) => !/^(Product Manager|Product Owner|SQL|Stakeholder Management)$/i.test(k))
      .slice(0, 3);
    const theme =
      themeBits.length >= 1
        ? `especially ${themeBits.join(', ').toLowerCase()} in practical delivery`
        : 'working close to customers, partners, and the product in market';
    cl.p3 = noEmDash(
      `What excites me about the ${role} role at ${company} is ${theme}. I am passionate about shipping products that solve real problems and move business metrics, and I would love to bring my experimentation mindset, analytical toolkit, and cross-functional leadership to your team.`,
    );
  }

  cl.p4 = fill(master.p4);
  if (!cl.p4 || cl.p4.length < 200) {
    cl.p4 = noEmDash(
      `Thank you for your consideration. I am based in Berlin, available for interviews at your earliest convenience, can start immediately, and hold a valid work permit to work full-time in Germany. I look forward to talking with you.`,
    );
  }

  cl.highlights = (master.highlights || []).map((h) => ({
    ...h,
    text: noEmDash(String(h.text || '')),
  }));
  cl.avatar = master.avatar || cl.avatar;
  cl.layoutSettings = {
    ...(master.layoutSettings || {}),
    ...(cl.layoutSettings || {}),
    showPhoto: true,
    // Larger body type so the letter does not look sparse on the page.
    fontSize: Math.max(Number(cl.layoutSettings?.fontSize || master.layoutSettings?.fontSize || 9), 10),
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
    const detail = (boost.stderr || boost.stdout || '').slice(0, 1200);
    if (boost.status === 4 || /QUALITY GATE FAILED/i.test(detail)) {
      throw new Error(
        `Quality gate blocked pack (ATS stuffing / language / honesty checks). Will not upload. ${detail}`,
      );
    }
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
    r2Meta = await uploadApplicationDocs({
      jobId,
      packDir: outDir,
      company,
      resumeFileNamePattern:
        opts.resumeFileNamePattern ||
        opts.resume_file_name_pattern ||
        opts.resumePdfNamePattern,
      coverLetterFileNamePattern:
        opts.coverLetterFileNamePattern ||
        opts.cover_letter_file_name_pattern ||
        opts.coverLetterPdfNamePattern,
    });
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
