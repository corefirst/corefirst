// Pinyin → IPA phoneme mapping for Chinese learners of English.
// Grouped by category to highlight cross-language transfer patterns.

export interface PhonemeEntry {
  pinyin: string;
  ipa: string;
  englishApprox: string; // closest English sound description
  exampleEn: string;     // English word containing similar sound
  tricky?: boolean;      // no close English equivalent — needs special attention
}

export interface PhonemeGroup {
  label: string;
  hint?: string;
  items: PhonemeEntry[];
}

export const PINYIN_IPA_GROUPS: PhonemeGroup[] = [
  {
    label: 'Stops & Nasals',
    hint: 'Similar to English — transfer directly.',
    items: [
      { pinyin: 'b',  ipa: '/p/',  englishApprox: 'unaspirated "b"', exampleEn: 'spot' },
      { pinyin: 'p',  ipa: '/pʰ/', englishApprox: 'aspirated "p"',  exampleEn: 'pot'  },
      { pinyin: 'd',  ipa: '/t/',  englishApprox: 'unaspirated "d"', exampleEn: 'stop' },
      { pinyin: 't',  ipa: '/tʰ/', englishApprox: 'aspirated "t"',  exampleEn: 'top'  },
      { pinyin: 'g',  ipa: '/k/',  englishApprox: 'unaspirated "g"', exampleEn: 'sky'  },
      { pinyin: 'k',  ipa: '/kʰ/', englishApprox: 'aspirated "k"',  exampleEn: 'key'  },
      { pinyin: 'm',  ipa: '/m/',  englishApprox: '"m"', exampleEn: 'me'    },
      { pinyin: 'n',  ipa: '/n/',  englishApprox: '"n"', exampleEn: 'no'    },
      { pinyin: 'ng', ipa: '/ŋ/',  englishApprox: '"ng"', exampleEn: 'sing'  },
    ],
  },
  {
    label: 'Fricatives & Approximants',
    hint: 'f, l, s are identical to English. h and r are different.',
    items: [
      { pinyin: 'f',  ipa: '/f/',  englishApprox: '"f"', exampleEn: 'far' },
      { pinyin: 'l',  ipa: '/l/',  englishApprox: '"l"', exampleEn: 'law' },
      { pinyin: 's',  ipa: '/s/',  englishApprox: '"s"', exampleEn: 'sun' },
      { pinyin: 'h',  ipa: '/x/',  englishApprox: 'velar "ch" — like clearing throat', exampleEn: 'Bach (German)', tricky: true },
      { pinyin: 'y',  ipa: '/j/',  englishApprox: '"y"', exampleEn: 'yes' },
      { pinyin: 'w',  ipa: '/w/',  englishApprox: '"w"', exampleEn: 'we'  },
    ],
  },
  {
    label: 'Retroflex Consonants (zh, ch, sh, r)',
    hint: 'Curl tongue tip upward and back. No English equivalent.',
    items: [
      { pinyin: 'zh', ipa: '/ʈʂ/', englishApprox: '"j" in jump but tongue curled back', exampleEn: 'judge', tricky: true },
      { pinyin: 'ch', ipa: '/ʈʂʰ/',englishApprox: '"ch" but tongue curled back', exampleEn: 'church', tricky: true },
      { pinyin: 'sh', ipa: '/ʂ/',  englishApprox: '"sh" but tongue curled back', exampleEn: 'shoe', tricky: true },
      { pinyin: 'r',  ipa: '/ʐ/',  englishApprox: '"r" with tongue curled further back', exampleEn: 'red', tricky: true },
    ],
  },
  {
    label: 'Dental Sibilants (z, c)',
    hint: 'Tongue tip touches upper teeth — sharper than English z.',
    items: [
      { pinyin: 'z',  ipa: '/ts/', englishApprox: '"ts" as in cats', exampleEn: 'cats', tricky: true },
      { pinyin: 'c',  ipa: '/tsʰ/',englishApprox: '"ts" with a puff of air', exampleEn: 'hats', tricky: true },
    ],
  },
  {
    label: 'Palatal Consonants (j, q, x)',
    hint: 'Tongue middle arches toward hard palate — only before i/ü.',
    items: [
      { pinyin: 'j',  ipa: '/tɕ/', englishApprox: '"j" in jeep but further forward', exampleEn: 'jeep', tricky: true },
      { pinyin: 'q',  ipa: '/tɕʰ/',englishApprox: '"ch" in cheese but further forward', exampleEn: 'cheese', tricky: true },
      { pinyin: 'x',  ipa: '/ɕ/',  englishApprox: '"sh" but tongue further forward', exampleEn: 'she', tricky: true },
    ],
  },
  {
    label: 'Vowels',
    hint: 'Pure vowels — no diphthong glide as in English.',
    items: [
      { pinyin: 'a',  ipa: '/a/',  englishApprox: '"a" in father', exampleEn: 'father' },
      { pinyin: 'e',  ipa: '/ɤ/',  englishApprox: 'back unrounded — between "uh" and "o"', exampleEn: '(none)', tricky: true },
      { pinyin: 'i',  ipa: '/i/',  englishApprox: '"ee" in feet', exampleEn: 'feet' },
      { pinyin: 'o',  ipa: '/o/',  englishApprox: '"o" in more (pure, no glide)', exampleEn: 'more' },
      { pinyin: 'u',  ipa: '/u/',  englishApprox: '"oo" in food (pure, no glide)', exampleEn: 'food' },
      { pinyin: 'ü',  ipa: '/y/',  englishApprox: 'French "u" / German "ü" — round lips for "oo" and say "ee"', exampleEn: '(none)', tricky: true },
      { pinyin: 'er', ipa: '/ɚ/',  englishApprox: '"er" in teacher (rhotic)', exampleEn: 'teacher' },
    ],
  },
  {
    label: 'Common Mistake Pairs',
    hint: 'These pairs confuse English speakers the most.',
    items: [
      { pinyin: 'zh vs z',  ipa: '/ʈʂ/ vs /ts/', englishApprox: 'retroflex vs dental — tongue position differs', exampleEn: 'judge vs cats', tricky: true },
      { pinyin: 'x vs sh',  ipa: '/ɕ/ vs /ʂ/',  englishApprox: 'palatal vs retroflex "sh" — tongue position differs', exampleEn: 'she (both approximate)', tricky: true },
      { pinyin: 'n vs l',   ipa: '/n/ vs /l/',   englishApprox: 'same as English n vs l', exampleEn: 'no vs low' },
      { pinyin: 'b/d/g aspirated vs unaspirated', ipa: '/p pʰ t tʰ k kʰ/', englishApprox: 'aspiration (air puff) is the key distinction', exampleEn: 'spot (b) vs pot (p)', tricky: true },
    ],
  },
];

export function searchPinyin(query: string): PhonemeEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return PINYIN_IPA_GROUPS
    .flatMap(g => g.items)
    .filter(e =>
      e.pinyin.includes(q) ||
      e.ipa.includes(q) ||
      e.englishApprox.toLowerCase().includes(q) ||
      e.exampleEn.toLowerCase().includes(q)
    );
}
