/**
 * Extract experience requirement from a job description / LinkedIn seniority.
 *
 * Returns a short human label, e.g.:
 *   "3+ years" | "3-5 years" | "Mid-Senior level" | "Not specified"
 */
export function extractExperienceRequired({
  description = '',
  title = '',
  linkedInLevel = '',
} = {}) {
  const text = `${title}\n${description}`.replace(/\s+/g, ' ').trim();
  const fromJd = parseYearsFromText(text);
  if (fromJd) return fromJd;

  const level = normalizeLinkedInLevel(linkedInLevel);
  if (level) return level;

  // Title-only soft signal (avoid matching "Director" buried in JD body)
  const fromTitle = softSeniorityFromTitle(title);
  if (fromTitle) return fromTitle;

  return 'Not specified';
}

function normalizeLinkedInLevel(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const key = s.toLowerCase().replace(/[_-]+/g, ' ');
  const map = {
    internship: 'Internship',
    entry: 'Entry level',
    'entry level': 'Entry level',
    associate: 'Associate',
    mid: 'Mid-Senior level',
    'mid senior': 'Mid-Senior level',
    'mid-senior': 'Mid-Senior level',
    'mid-senior level': 'Mid-Senior level',
    senior: 'Mid-Senior level',
    director: 'Director',
    executive: 'Executive',
    'not applicable': '',
  };
  if (map[key] !== undefined) return map[key];
  // Already a nice label from LinkedIn UI
  if (/level|internship|associate|director|executive/i.test(s)) return s;
  return s;
}

function parseYearsFromText(text) {
  if (!text || text.length < 10) return '';
  const lower = text.toLowerCase();

  // Prefer explicit experience phrases over bare numbers
  const patterns = [
    // 3-5 years / 3 – 5 yrs of experience
    /(?:minimum\s+of\s+|at\s+least\s+|min\.?\s+)?(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b(?:\s*(?:of\s+)?(?:experience|exp\.?))?/i,
    // 3+ years / 5 years+ of experience
    /(?:minimum\s+of\s+|at\s+least\s+|min\.?\s+)?(\d{1,2})\s*\+\s*(?:years?|yrs?)\b(?:\s*(?:of\s+)?(?:experience|exp\.?))?/i,
    /(?:minimum\s+of\s+|at\s+least\s+|min\.?\s+)?(\d{1,2})\s*(?:years?|yrs?)\s*\+/i,
    // at least 3 years / minimum 5 years experience
    /(?:at\s+least|minimum(?:\s+of)?|min\.?|no\s+less\s+than)\s+(\d{1,2})\s*(?:years?|yrs?)\b(?:\s*(?:of\s+)?(?:experience|exp\.?))?/i,
    // 3 years of experience / 3 yrs experience
    /(\d{1,2})\s*(?:years?|yrs?)\s*(?:of\s+)?(?:relevant\s+|professional\s+|hands-?on\s+)?(?:experience|exp\.?)\b/i,
    // experience: 3 years / Erfahrung: 3 Jahre
    /(?:experience|erfahrung)\s*[:=]\s*(\d{1,2})\s*(?:[-–]\s*(\d{1,2})\s*)?(?:\+?\s*)?(?:years?|yrs?|jahre?)/i,
    // German: mindestens 3 Jahre Berufserfahrung
    /(?:mindestens|mind\.?)\s+(\d{1,2})\s*(?:[-–]\s*(\d{1,2})\s*)?\+?\s*jahre?\b(?:\s*(?:berufs)?erfahrung)?/i,
    /(\d{1,2})\s*(?:[-–]\s*(\d{1,2})\s*)?\+?\s*jahre?\s+(?:berufs)?erfahrung/i,
  ];

  for (const re of patterns) {
    const m = lower.match(re);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] != null && m[2] !== '' ? Number(m[2]) : null;
    if (!Number.isFinite(a) || a < 0 || a > 30) continue;
    if (b != null) {
      if (!Number.isFinite(b) || b < a || b > 40) continue;
      return `${a}-${b}`; // numeric range, e.g. 3-5
    }
    // Detect + from original match text
    const slice = m[0];
    if (/\+/.test(slice) || /at\s+least|minimum|min\.?|mindestens/i.test(slice)) {
      return `${a}+`;
    }
    return `${a}+`;
  }

  return '';
}

function softSeniorityFromTitle(title) {
  const t = String(title || '').toLowerCase();
  if (!t) return '';
  if (/\b(intern|internship|werkstudent|working student)\b/i.test(t)) return 'Internship';
  if (/\b(junior|entry[- ]level|associate)\b/i.test(t) && !/\b(senior|lead|principal|staff|director|head)\b/i.test(t)) {
    return 'Entry level';
  }
  if (/\b(principal|staff)\b/i.test(t)) return 'Principal/Staff';
  if (/\b(director|head of|vp |vice president)\b/i.test(t)) return 'Director';
  // Soft label only — does not auto-reject; years gate decides keep/skip.
  if (/\b(senior|lead|sr\.?)\b/i.test(t)) return 'Mid-Senior level';
  return '';
}

// CLI smoke test
const isCli =
  process.argv[1] &&
  (process.argv[1].endsWith('extract-experience-required.mjs') ||
    process.argv[1].includes('extract-experience-required'));
if (isCli) {
  const sample = process.argv.slice(2).join(' ') ||
    'We need at least 3-5 years of product management experience.';
  console.log(
    JSON.stringify(
      { input: sample, experience_required: extractExperienceRequired({ description: sample }) },
      null,
      2,
    ),
  );
}
