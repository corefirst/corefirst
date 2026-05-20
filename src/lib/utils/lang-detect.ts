// Script-class detection used to catch reversed L1/L2 pairs in generated
// course scripts. The course-gen LLM occasionally flips cflt_l1 / cflt_l2 in
// later scripts of a lesson; counting characters per Unicode block gives us a
// cheap, deterministic way to detect and correct that.

export type Script = 'cjk' | 'hiragana-katakana' | 'hangul' | 'cyrillic' | 'arabic' | 'thai' | 'latin' | 'unknown';

/** Map a language name (as used in CoursewareManifest.sourceLang/targetLang) to its dominant script. */
export function expectedScript(lang: string): Script {
  const k = lang.trim().toLowerCase();
  if (k === 'chinese' || k === 'mandarin' || k === 'cantonese' || k === 'zh') return 'cjk';
  if (k === 'japanese' || k === 'ja') return 'hiragana-katakana';
  if (k === 'korean' || k === 'ko') return 'hangul';
  if (k === 'russian' || k === 'ru' || k === 'ukrainian' || k === 'uk') return 'cyrillic';
  if (k === 'arabic' || k === 'ar') return 'arabic';
  if (k === 'thai' || k === 'th') return 'thai';
  if (
    k === 'english' || k === 'en' ||
    k === 'spanish' || k === 'es' ||
    k === 'french' || k === 'fr' ||
    k === 'german' || k === 'de' ||
    k === 'italian' || k === 'it' ||
    k === 'portuguese' || k === 'pt' ||
    k === 'dutch' || k === 'nl' ||
    k === 'polish' || k === 'pl' ||
    k === 'turkish' || k === 'tr' ||
    k === 'vietnamese' || k === 'vi' ||
    k === 'indonesian' || k === 'id'
  ) return 'latin';
  return 'unknown';
}

/** Count Unicode code points in `text` that fall into each script block. Returns the script with the highest count, or 'unknown' for empty / punctuation-only input. */
export function detectScript(text: string): Script {
  if (!text) return 'unknown';
  const counts: Record<Script, number> = {
    'cjk': 0,
    'hiragana-katakana': 0,
    'hangul': 0,
    'cyrillic': 0,
    'arabic': 0,
    'thai': 0,
    'latin': 0,
    'unknown': 0,
  };
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    // Hiragana / Katakana must be checked BEFORE CJK because Japanese text
    // contains both kana and kanji — if a string has any kana we should call
    // it Japanese, not Chinese.
    if ((code >= 0x3040 && code <= 0x309f) || (code >= 0x30a0 && code <= 0x30ff)) {
      counts['hiragana-katakana']++;
    } else if (
      (code >= 0x4e00 && code <= 0x9fff) ||  // CJK Unified Ideographs
      (code >= 0x3400 && code <= 0x4dbf) ||  // CJK Extension A
      (code >= 0xf900 && code <= 0xfaff)     // CJK Compatibility Ideographs
    ) {
      counts['cjk']++;
    } else if (code >= 0xac00 && code <= 0xd7af) {
      counts['hangul']++;
    } else if ((code >= 0x0400 && code <= 0x04ff) || (code >= 0x0500 && code <= 0x052f)) {
      counts['cyrillic']++;
    } else if ((code >= 0x0600 && code <= 0x06ff) || (code >= 0x0750 && code <= 0x077f)) {
      counts['arabic']++;
    } else if (code >= 0x0e00 && code <= 0x0e7f) {
      counts['thai']++;
    } else if (
      (code >= 0x0041 && code <= 0x005a) ||  // A-Z
      (code >= 0x0061 && code <= 0x007a) ||  // a-z
      (code >= 0x00c0 && code <= 0x024f)     // Latin-1 Supplement + Latin Extended A/B
    ) {
      counts['latin']++;
    }
  }
  // Promote Japanese over CJK if any kana found.
  if (counts['hiragana-katakana'] > 0) return 'hiragana-katakana';
  let best: Script = 'unknown';
  let bestCount = 0;
  for (const s of Object.keys(counts) as Script[]) {
    if (s === 'unknown') continue;
    if (counts[s] > bestCount) {
      best = s;
      bestCount = counts[s];
    }
  }
  return best;
}

/**
 * Verify that `l1` is in `sourceLang` and `l2` is in `targetLang`. If the pair
 * is clearly reversed (l1 matches the target script and l2 matches the source
 * script, AND the two languages use distinct scripts), return them swapped.
 * Otherwise return the original tuple.
 *
 * Conservative: when either string's dominant script is `unknown`, or both
 * languages share the same expected script (e.g., English ↔ Spanish), we
 * return the input untouched — a wrong swap would be worse than a missed one.
 */
export function verifyL1L2(
  l1: string,
  l2: string,
  sourceLang: string,
  targetLang: string,
): { l1: string; l2: string; swapped: boolean } {
  const srcScript = expectedScript(sourceLang);
  const tgtScript = expectedScript(targetLang);
  if (srcScript === 'unknown' || tgtScript === 'unknown' || srcScript === tgtScript) {
    return { l1, l2, swapped: false };
  }
  const l1Script = detectScript(l1);
  const l2Script = detectScript(l2);
  if (l1Script === tgtScript && l2Script === srcScript) {
    return { l1: l2, l2: l1, swapped: true };
  }
  return { l1, l2, swapped: false };
}
