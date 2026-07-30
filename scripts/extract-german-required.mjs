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

/** First CEFR level that belongs to German in a sentence (ignore English levels). */
function germanCefrFromText(text) {
  const s = String(text || '');
  // German/Deutsch … CEFR, stopping before English clause when possible
  const patterns = [
    /\b(?:german|deutsch(?:kenntnisse)?)\b(?:(?!\benglish\b)[^.!?]){0,40}?\b(a1|a2|b1|b2|c1|c2)\b/i,
    /\b(a1|a2|b1|b2|c1|c2)\b(?:(?!\benglish\b)[^.!?]){0,40}?\b(?:german|deutsch)\b/i,
    /\bdeutschkenntnisse\b[^.!?english]{0,40}?\b(a1|a2|b1|b2|c1|c2)\b/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (!m) continue;
    const span = m[0].toLowerCase();
    if (/\benglish\b/.test(span) && !/\b(?:german|deutsch)[^.!?]{0,20}\b(a1|a2|b1|b2|c1|c2)\b/.test(span)) {
      continue;
    }
    // Reject "English B2 … German" style false positives on reverse pattern
    if (/^\s*(a1|a2|b1|b2|c1|c2)\b/i.test(m[0]) && /\benglish\b[^.!?]{0,30}$/i.test(s.slice(0, m.index))) {
      continue;
    }
    if (m.index != null) {
      const before = s.slice(Math.max(0, m.index - 40), m.index).toLowerCase();
      if (/\benglish\b/.test(before) && !/\b(?:german|deutsch)\b/.test(before)) continue;
    }
    return m[1].toUpperCase();
  }
  return '';
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

  // --- Native / Fluent FIRST ---
  // JDs often say: "Native or fluent in German, very good level of English (B2)"
  // Old bug: CEFR matcher grabbed English B2 and returned B2 before Native ran.

  if (
    /native\s+or\s+fluent(?:ly)?\s+(?:in\s+)?german/i.test(lower) ||
    /fluent\s+or\s+native\s+(?:in\s+)?german/i.test(lower) ||
    /(?:native|fluent)\s*\/\s*(?:fluent|native)\s+(?:in\s+)?german/i.test(lower)
  ) {
    return 'Native';
  }

  if (
    /(?:native|mother[- ]tongue)\s+(?:in\s+|speaker\s+(?:of\s+)?)?german/i.test(lower) ||
    /german\s+(?:native|mother[- ]tongue)/i.test(lower) ||
    /(?:native|mother[- ]tongue|muttersprach)[^.!?]{0,30}(?:german|deutsch)/i.test(lower) ||
    /(?:german|deutsch)[^.!?]{0,30}(?:native|mother[- ]tongue|muttersprach)/i.test(lower) ||
    /deutsch\s+als\s+muttersprache/i.test(lower)
  ) {
    // Don't treat "native English … German nice-to-have" as Native German
    if (/native\s+english/i.test(lower) && !/native[^.!?]{0,20}german|german[^.!?]{0,20}native/i.test(lower)) {
      /* fall through */
    } else {
      return 'Native';
    }
  }

  if (
    /(?:business\s+)?fluent(?:ly)?\s+(?:in\s+)?german/i.test(lower) ||
    /german\s+(?:business\s+)?fluent/i.test(lower) ||
    /fluent\s+german/i.test(lower) ||
    /verhandlungssicher\w*\s+deutsch/i.test(lower) ||
    /deutschkenntnisse\s+verhandlungssicher/i.test(lower) ||
    /flie[sß]end\w*\s+deutsch/i.test(lower)
  ) {
    return 'Fluent';
  }

  // Nice-to-have German before CEFR (so "English B2, German nice to have" ≠ B2)
  if (
    /(?:nice\s+to\s+have|plus|bonus|ideally|von\s+vorteil)[^.!?]{0,40}(?:german|deutsch)/i.test(
      lower,
    ) ||
    /(?:german|deutsch)[^.!?]{0,40}(?:nice\s+to\s+have|plus|von\s+vorteil|appreciated)/i.test(
      lower,
    )
  ) {
    // Only if no hard German requirement elsewhere
    if (
      !/native|fluent|verhandlungssicher|flie[sß]end|(?:german|deutsch)[^.!?]{0,20}\b(c1|c2|b2|b1|a2|a1)\b/i.test(
        lower,
      )
    ) {
      return 'B1';
    }
  }

  const cefr = germanCefrFromText(text);
  if (cefr) return cefr;

  // Soft: "German speaker" / "Deutschkenntnisse" without level → keep as B2
  if (
    /\bgerman\s+speaker\b/i.test(lower) ||
    /\bdeutschkenntnisse\b/i.test(lower) ||
    /\bgerman\s+(?:skills|language)\s+required\b/i.test(lower) ||
    /\bdeutsch\s+erforderlich\b/i.test(lower)
  ) {
    return 'B2';
  }

  // Nice-to-have only
  if (
    /(?:nice\s+to\s+have|plus|bonus|ideally|von\s+vorteil)[^.!?]{0,40}(?:german|deutsch)/i.test(
      lower,
    ) ||
    /(?:german|deutsch)[^.!?]{0,40}(?:nice\s+to\s+have|plus|von\s+vorteil)/i.test(
      lower,
    )
  ) {
    return 'B1';
  }

  if (/\bgerman\b|\bdeutsch/i.test(lower)) {
    return 'Not specified';
  }

  return 'None';
}

const isCli =
  process.argv[1] && process.argv[1].includes('extract-german-required');
if (isCli) {
  const sample =
    process.argv.slice(2).join(' ') ||
    'Languages: Native or fluent in German, very good level of English (B2).';
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
