#!/usr/bin/env node
/**
 * Check whether a LinkedIn job is still accepting applications.
 *
 * Usage:
 *   node scripts/check-job-open.mjs --job-id li_4392855779
 *   node scripts/check-job-open.mjs --url https://www.linkedin.com/jobs/view/4392855779
 *
 * Exit 0 + JSON: { open: true|false, reason, jobId, title? }
 */
import { writeFileSync } from 'node:fs';

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function extractJobId(input) {
  if (!input) return '';
  const m =
    String(input).match(/li_(\d+)/i) ||
    String(input).match(/jobs\/view\/(\d+)/) ||
    String(input).match(/^(\d{6,})$/);
  if (m) return m[1];
  if (String(input).startsWith('li_')) return String(input).slice(3);
  return String(input).replace(/^li_/, '');
}

const CLOSED_SIGNALS = [
  'no longer accepting applications',
  'no longer available',
  'this job is no longer available',
  'job listing is no longer active',
  'posting has been removed',
  'position has been filled',
  'job is closed',
  'this listing has expired',
  'job has been closed',
  'posting has expired',
];

export async function checkLinkedInJobOpen({ jobId, url } = {}) {
  const id = extractJobId(jobId || url);
  if (!id) throw new Error('jobId or LinkedIn url required');

  const guestUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`;
  const res = await fetch(guestUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  const html = await res.text();
  const low = html.toLowerCase();

  if (!res.ok || html.length < 200) {
    return {
      open: false,
      reason: `fetch_failed_${res.status}`,
      jobId: `li_${id}`,
      linkedInId: id,
    };
  }

  const closed = CLOSED_SIGNALS.find((s) => low.includes(s));
  const titleMatch =
    html.match(/class="top-card-layout__title[^"]*"[^>]*>([^<]+)/i) ||
    html.match(/<h1[^>]*>([^<]+)/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // Prefer explicit closed signal over heuristics
  if (closed) {
    return {
      open: false,
      reason: closed,
      jobId: `li_${id}`,
      linkedInId: id,
      title,
    };
  }

  // Extract a short JD snippet when open (useful for later generate)
  let description = '';
  const descMatch =
    html.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/description__text[^>]*>([\s\S]*?)<\/div>\s*<\/section>/i);
  if (descMatch) {
    description = descMatch[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // LinkedIn criteria list: "Seniority level" → Mid-Senior level, etc.
  let seniorityLevel = '';
  const seniorityMatch =
    html.match(
      /Seniority level[\s\S]{0,120}?<span[^>]*>\s*([^<]+?)\s*<\/span>/i,
    ) ||
    html.match(
      /description__job-criteria-item[\s\S]*?Seniority level[\s\S]*?description__job-criteria-text[^>]*>\s*([^<]+)/i,
    );
  if (seniorityMatch) seniorityLevel = seniorityMatch[1].trim();

  return {
    open: !closed,
    reason: closed || 'accepting_applications',
    jobId: `li_${id}`,
    linkedInId: id,
    title,
    description,
    descriptionLength: description.length,
    seniorityLevel,
  };
}

async function main() {
  const jobId = arg('job-id');
  const url = arg('url');
  const out = arg('out');
  const result = await checkLinkedInJobOpen({ jobId, url });
  const json = JSON.stringify(result, null, 2);
  if (out) writeFileSync(out, json + '\n');
  console.log(json);
  process.exit(result.open ? 0 : 2);
}

const isMain = process.argv[1] && process.argv[1].endsWith('check-job-open.mjs');
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
