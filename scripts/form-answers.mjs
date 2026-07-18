#!/usr/bin/env node
/**
 * Build sheet-safe form_answers: only shortlist-relevant fields + per-job Q&A.
 * Never dump contact/identity fields (name, email, phone, LinkedIn, etc.).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MASTER = path.join(ROOT, 'applications/master/form-answers.json');

const ALLOWED_BASE = new Set([
  'salary_expectation',
  'notice_period',
  'work_authorization',
  'visa_sponsorship_required',
  'german_level',
  'work_mode',
  'relocation',
  'how_did_you_hear',
]);

/**
 * @param {object} opts
 * @param {string} [opts.company]
 * @param {string} [opts.role]
 * @param {string} [opts.portal]
 * @param {Array<{q:string,a:string}>} [opts.qa] screening / application questions answered
 * @param {Record<string,string>} [opts.extra] other shortlist-relevant key/values
 */
export async function buildFormAnswers(opts = {}) {
  const master = JSON.parse(await readFile(MASTER, 'utf8'));
  const out = {};

  for (const key of ALLOWED_BASE) {
    if (master[key]) out[key] = master[key];
  }

  if (opts.company) out.company = opts.company;
  if (opts.role) out.role = opts.role;
  if (opts.portal) out.portal = opts.portal;

  const qa = [];
  if (Array.isArray(master.qa)) {
    for (const item of master.qa) {
      if (item?.q && item?.a) qa.push({ q: String(item.q).trim(), a: String(item.a).trim() });
    }
  }
  if (Array.isArray(opts.qa)) {
    for (const item of opts.qa) {
      if (item?.q && item?.a) qa.push({ q: String(item.q).trim(), a: String(item.a).trim() });
    }
  }
  if (qa.length) out.qa = qa;

  if (opts.extra && typeof opts.extra === 'object') {
    for (const [k, v] of Object.entries(opts.extra)) {
      if (!v) continue;
      // block obvious identity fields
      if (/^(full_)?name|first_name|last_name|email|phone|linkedin|portfolio|password/i.test(k)) {
        continue;
      }
      out[k] = v;
    }
  }

  return out;
}

export function formAnswersToSheetString(answers) {
  return JSON.stringify(answers, null, 0);
}
