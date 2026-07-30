/**
 * Shared experience helpers for scrapers + backfill.
 *
 * Policy (Sakshi ~3.5 YOE):
 * - Skip when minimum required years >= maxYears (default 5)
 * - Keep when years are unknown / < maxYears
 * - Senior / Lead / Global titles: years-gated only (not title-auto-reject)
 * - Director / VP / Head still excluded elsewhere by keyword lists
 */
import { extractExperienceRequired } from './extract-experience-required.mjs';

export { extractExperienceRequired };

/** Default: drop roles that require 5+ years. */
export const DEFAULT_MAX_YEARS = 5;

/** Normalize titles for matching: drop paren gender/seniority wrappers. */
export function normalizeTitleForFilter(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lead / Global are no longer auto-skipped by title.
 * Kept for callers that still check the flag — always false now;
 * YOE >= maxYears is enforced via shouldSkipForExperience instead.
 */
export function shouldSkipForLeadOrGlobalTitle(_title) {
  return false;
}

/**
 * Parse a minimum years value from labels like:
 *   "5+ years" → 5
 *   "3-5 years" → 3
 *   "4+ years" → 4
 *   "Mid-Senior level" → null (unknown numeric — keep for Senior titles)
 */
export function minYearsFromLabel(label) {
  const s = String(label || '').trim().toLowerCase();
  if (!s || s === 'not specified') return null;

  const range = s.match(/(\d{1,2})\s*[-–to]+\s*(\d{1,2})\s*\+?\s*(years?|yrs?|jahre?)?/);
  if (range) return Number(range[1]);

  const plus = s.match(/(\d{1,2})\s*\+\s*(years?|yrs?|jahre?)?/);
  if (plus) return Number(plus[1]);

  const plain = s.match(/(\d{1,2})\s*(years?|yrs?|jahre?)/);
  if (plain) return Number(plain[1]);

  return null;
}

/**
 * True if this role should be skipped because experience is too high.
 * Unknown / seniority-only labels (Senior, Mid-Senior) are kept.
 */
export function shouldSkipForExperience(label, maxYears = DEFAULT_MAX_YEARS) {
  const minY = minYearsFromLabel(label);
  if (minY == null) return false;
  return minY >= maxYears;
}

export function evaluateExperience({
  description = '',
  title = '',
  linkedInLevel = '',
  maxYears = DEFAULT_MAX_YEARS,
} = {}) {
  const experience_required = extractExperienceRequired({
    description,
    title,
    linkedInLevel,
  });
  const min_years = minYearsFromLabel(experience_required);
  const skipYears = shouldSkipForExperience(experience_required, maxYears);
  return {
    experience_required,
    min_years,
    skip_for_experience: skipYears,
    // Legacy flag — always false; Lead/Senior kept unless YOE >= maxYears
    skip_for_lead_or_global_title: false,
    max_years: maxYears,
  };
}
