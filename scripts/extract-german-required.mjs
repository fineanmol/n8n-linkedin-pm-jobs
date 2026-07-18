/**
 * Extract German language requirement from JD / title.
 *
 * Returns short labels:
 *   None | A1 | A2 | B1 | B2 | C1 | C2 | Fluent | Native | Not specified
 *
 * Policy for Sakshi (learning B2): anything above B2 → sheet status
 * "Only German Required" (C1, C2, Fluent, Native).
 */

const RANK = {
  none: 0,
  a1: 1,
  a2: 2,
  b1: 3,
  b2: 4,
  c1: 5,
  c2: 6,
  fluent: 5, // treat as ~C1
  native: 7,
};

export function germanRank(label) {
  const key = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!key || key === 'not specified') return null;
  if (key === 'none' || key === 'not required') return 0;
  return RANK[key] ?? null;
}

/** True if required German is above B2. */
export function shouldSkipForGerman(label, maxLevel = 'B2') {
  const need = germanRank(label);
  if (need == null) return false; // unknown → keep
  if (need === 0) return false; // explicitly none
  const max = germanRank(maxLevel) ?? 4;
  return need > max;
}

export function extractGermanRequired({ description = '', title = '' } = {}) {
  const text = `${title}\n${description}`.replace(/\s+/g, ' ').trim();
  if (!text) return 'Not specified';

  const lower = text.toLowerCase();

  // Explicit "no German required"
  if (
    /(?:no|without|nicht)\s+(?:german|deutsch)(?:\s+required)?/i.test(lower) ||
    /german\s+not\s+required/i.test(lower) ||
    /deutschkenntnisse\s+nicht\s+erforderlich/i.test(lower) ||
    /english(?:-|\s+)only/i.test(lower)
  ) {
    return 'None';
  }

  // CEFR codes near German/Deutsch (prefer explicit level over soft words)
  const cefrNearGerman = [
    /(?:german|deutsch(?:kenntnisse)?)[^.!?]{0,40}\b(a1|a2|b1|b2|c1|c2)\b/i,
    /\b(a1|a2|b1|b2|c1|c2)\b[^.!?]{0,40}(?:german|deutsch)/i,
    /deutschkenntnisse[^.!?]{0,40}\b(a1|a2|b1|b2|c1|c2)\b/i,
    /sprachniveau[^.!?]{0,30}\b(a1|a2|b1|b2|c1|c2)\b/i,
    /verhandlungssicher(?:e|en)?[^.!?]{0,40}\b(a1|a2|b1|b2|c1|c2)\b/i,
  ];
  for (const re of cefrNearGerman) {
    const m = text.match(re);
    if (m) return m[1].toUpperCase();
  }

  // Standalone CEFR in language section-ish context
  const cefrAny = text.match(
    /\b(?:level|niveau|min(?:imum)?\.?|at\s+least)\s*(a1|a2|b1|b2|c1|c2)\b/i,
  );
  if (cefrAny && /german|deutsch|language|sprache/i.test(lower)) {
    return cefrAny[1].toUpperCase();
  }

  // Native / mother tongue
  if (
    /(?:native|mother[- ]tongue|muttersprach)/i.test(lower) &&
    /(?:german|deutsch)/i.test(lower)
  ) {
    return 'Native';
  }
  if (/deutsch\s+als\s+muttersprache/i.test(lower)) return 'Native';

  // Fluent / business fluent / verhandlungssicher ≈ above B2
  if (
    /(?:business\s+)?fluent(?:ly)?\s+(?:in\s+)?german/i.test(lower) ||
    /german\s+(?:business\s+)?fluent/i.test(lower) ||
    /verhandlungssicher(?:e|en)?\s+deutsch/i.test(lower) ||
    /deutschkenntnisse\s+verhandlungssicher/i.test(lower) ||
    /flie[sß]end(?:e|es)?\s+deutsch/i.test(lower)
  ) {
    return 'Fluent';
  }

  // Soft: "German speaker" / "Deutschkenntnisse" without level → assume B2-ish keep
  if (
    /\bgerman\s+speaker\b/i.test(lower) ||
    /\bdeutschkenntnisse\b/i.test(lower) ||
    /\bgerman\s+(?:skills|language)\s+required\b/i.test(lower) ||
    /\bdeutsch\s+erforderlich\b/i.test(lower)
  ) {
    return 'B2'; // conservative keep for learner at B2
  }

  // Mentions German as nice-to-have only
  if (
    /(?:nice\s+to\s+have|plus|bonus|ideally|von\s+vorteil)[^.!?]{0,40}(?:german|deutsch)/i.test(
      lower,
    ) ||
    /(?:german|deutsch)[^.!?]{0,40}(?:nice\s+to\s+have|plus|von\s+vorteil)/i.test(
      lower,
    )
  ) {
    return 'B1'; // treat soft preference as <= B2
  }

  if (/\bgerman\b|\bdeutsch/i.test(lower)) {
    // Mentioned but unclear — don't auto-disqualify
    return 'Not specified';
  }

  return 'None';
}

const isCli =
  process.argv[1] && process.argv[1].includes('extract-german-required');
if (isCli) {
  const sample =
    process.argv.slice(2).join(' ') ||
    'Product Manager (German Speaker) — German B2 required, English C1';
  console.log(
    JSON.stringify(
      {
        input: sample,
        german_required: extractGermanRequired({ description: sample }),
        skip: shouldSkipForGerman(
          extractGermanRequired({ description: sample }),
        ),
      },
      null,
      2,
    ),
  );
}
