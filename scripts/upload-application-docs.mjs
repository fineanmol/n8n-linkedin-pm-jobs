#!/usr/bin/env node
/**
 * Upload resume.pdf + cover_letter.pdf for a job pack to Cloudflare R2
 * with clear filenames: Name_Resume_CompanyName.pdf / Name_Cover_Letter_CompanyName.pdf
 *
 * Usage:
 *   node scripts/upload-application-docs.mjs --job-id li_xxx --pack-dir applications/jobs/... [--company "Acme"]
 *
 * Env (optional overrides):
 *   R2_BUCKET                 default sakshi-job-applications
 *   R2_PUBLIC_BASE_URL        default https://pub-47bf039641094cef9259459eeb1367d4.r2.dev
 *   R2_KEY_PREFIX             default job-apps
 */
import { access, copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

/** Safe filename slug for company, e.g. "BEUMER Group" → "BEUMER_Group" */
export function companyFileSlug(company) {
  const s = String(company || "Company")
    .replace(/&amp;/gi, "and")
    .replace(/&/g, "and")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return s || "Company";
}

function requireFile(p) {
  return access(p).then(() => p);
}

function putObject(bucket, key, filePath, contentType) {
  const result = spawnSync(
    "npx",
    [
      "wrangler",
      "r2",
      "object",
      "put",
      `${bucket}/${key}`,
      "--file",
      filePath,
      "--content-type",
      contentType,
      "--remote",
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(
      `R2 upload failed for ${key}:\n${result.stdout || ""}\n${result.stderr || ""}`,
    );
  }
}

async function resolveCompany(absPack, company) {
  if (company && String(company).trim()) return String(company).trim();
  for (const name of ["meta.json", "sheet_fields.json"]) {
    try {
      const data = JSON.parse(await readFile(path.join(absPack, name), "utf8"));
      if (data.company) return String(data.company).trim();
      // form_answers sometimes embeds company
      if (data.form_answers) {
        try {
          const fa =
            typeof data.form_answers === "string"
              ? JSON.parse(data.form_answers)
              : data.form_answers;
          if (fa?.company) return String(fa.company).trim();
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }
  // folder: li_123_company_slug
  const base = path.basename(absPack);
  const m = base.match(/^li_\d+_(.+)$/);
  if (m) {
    return m[1]
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return "Company";
}

export async function uploadApplicationDocs({
  jobId,
  packDir,
  company,
  resumeFileNamePattern,
  coverLetterFileNamePattern,
  bucket = process.env.R2_BUCKET || "sakshi-job-applications",
  publicBase = process.env.R2_PUBLIC_BASE_URL ||
    "https://pub-47bf039641094cef9259459eeb1367d4.r2.dev",
  keyPrefix = process.env.R2_KEY_PREFIX || "job-apps",
} = {}) {
  if (!jobId) throw new Error("jobId is required");
  const absPack = path.resolve(ROOT, packDir || "");
  const resumeLocal = path.join(absPack, "resume.pdf");
  const clLocal = path.join(absPack, "cover_letter.pdf");
  await requireFile(resumeLocal);
  await requireFile(clLocal);

  const companyName = await resolveCompany(absPack, company);
  const slug = companyFileSlug(companyName);
  // Optional overrides from n8n Config / composePack body:
  //   resumeFileNamePattern: "Sakshi_Resume_{company}"
  //   coverLetterFileNamePattern: "Sakshi_Cover_Letter_{company}"
  const resumePat =
    resumeFileNamePattern ||
    process.env.RESUME_PDF_NAME_PATTERN ||
    "Sakshi_Resume_{company}";
  const clPat =
    coverLetterFileNamePattern ||
    process.env.COVER_LETTER_PDF_NAME_PATTERN ||
    "Sakshi_Cover_Letter_{company}";
  const applyPat = (pat) =>
    String(pat || "")
      .replace(/\{\{\s*company\s*\}\}/gi, slug)
      .replace(/\{company\}/gi, slug)
      .replace(/\.pdf$/i, "");
  const resumeFile = `${applyPat(resumePat) || `Sakshi_Resume_${slug}`}.pdf`;
  const clFile = `${applyPat(clPat) || `Sakshi_Cover_Letter_${slug}`}.pdf`;

  // Named local copies (sheet downloads use R2 URL basename)
  const resumeNamedLocal = path.join(absPack, resumeFile);
  const clNamedLocal = path.join(absPack, clFile);
  await copyFile(resumeLocal, resumeNamedLocal);
  await copyFile(clLocal, clNamedLocal);

  const resumeKey = `${keyPrefix}/${jobId}/${resumeFile}`;
  const clKey = `${keyPrefix}/${jobId}/${clFile}`;

  putObject(bucket, resumeKey, resumeNamedLocal, "application/pdf");
  putObject(bucket, clKey, clNamedLocal, "application/pdf");

  const base = publicBase.replace(/\/$/, "");
  return {
    jobId,
    company: companyName,
    companySlug: slug,
    bucket,
    resumeKey,
    coverLetterKey: clKey,
    resumeFile,
    coverLetterFile: clFile,
    resumeUrl: `${base}/${resumeKey}`,
    coverLetterUrl: `${base}/${clKey}`,
    resumeLocal: resumeNamedLocal,
    coverLetterLocal: clNamedLocal,
  };
}

async function main() {
  const jobId = arg("job-id");
  const packDir = arg("pack-dir");
  const company = arg("company");
  if (!jobId || !packDir) {
    console.error(
      'Usage: node scripts/upload-application-docs.mjs --job-id li_xxx --pack-dir applications/jobs/... [--company "Acme"]',
    );
    process.exit(1);
  }
  const result = await uploadApplicationDocs({ jobId, packDir, company });
  console.log(JSON.stringify(result, null, 2));
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
