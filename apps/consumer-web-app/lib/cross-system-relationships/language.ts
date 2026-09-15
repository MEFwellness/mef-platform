/**
 * The language guardrails for the Relationship Library, in one place.
 *
 * WHY A SHARED MODULE RATHER THAN A RULE IN A TEST. Three things have to
 * agree about which words this feature may use: the shipped strings, the
 * seeded example copy, and the warning the editor shows the coach while
 * she types. If the test owned the list, the editor could not show it,
 * and a coach would find out what the house style is by having a build
 * fail. So the list lives here, the editor reads it, and
 * tests/cross-system-relationship-copy.test.ts reads the same list.
 *
 * WHAT THIS FEATURE SAYS. A relationship is a thing OBSERVED TOGETHER and
 * a thing WORTH EXPLORING. It is never a claim about what causes what,
 * never a condition, and never something the platform confirms. That is
 * not a stylistic preference: a coaching platform that says a symptom
 * comes from an organ is practising medicine, and this library is a
 * coach's own notes about what she wants to ask about next.
 *
 * THE EDITOR WARNS, IT DOES NOT REFUSE. The coach is the author of every
 * word in this library and she may have a reason to quote a phrase. What
 * the editor does is name the phrase it found so the choice is a choice.
 * The SHIPPED strings, which she did not write, are the ones the test
 * holds to zero.
 */

/**
 * The vocabulary this feature writes in, shown in the editor as the house
 * style rather than kept in somebody's head.
 */
export const ASSOCIATION_VOCABULARY = [
  'possible association',
  'whole-body pattern',
  'cross-system pattern',
  'supporting signals',
  'worth exploring',
  'coaching consideration',
  'observed together',
  'may be relevant',
] as const;

export type BannedPhraseRule = {
  /** The phrase as a person would say it, which is what a warning prints. */
  phrase: string;
  /** What to write instead. */
  instead: string;
  /** Word bounded so "because" is not a hit on "cause" and "increase" is not one either. */
  pattern: RegExp;
};

/**
 * THE BANNED LIST. Every entry is word bounded, and the single words carry
 * their inflections, because "causing" is the same claim as "cause".
 *
 * Note what is NOT here: the bare word "organ". The Signal Library's own
 * categories name body systems and a coach has every reason to write one
 * down. What is banned is the claim built on top of it.
 */
export const BANNED_PHRASES: readonly BannedPhraseRule[] = [
  {
    phrase: 'cause',
    instead: 'observed together, or may be relevant',
    pattern: /\bcaus(e|es|ed|ing|ative)\b/i,
  },
  {
    phrase: 'disease',
    instead: 'signal, or pattern',
    pattern: /\bdiseases?\b/i,
  },
  {
    phrase: 'diagnosis',
    instead: 'possible association',
    pattern: /\bdiagnos(is|es|e|ed|ing|tic)\b/i,
  },
  {
    phrase: 'organ dysfunction',
    instead: 'signals from more than one system',
    pattern: /\borgan\s+dysfunction\b/i,
  },
  {
    phrase: 'confirms',
    instead: 'is worth exploring',
    pattern: /\bconfirm(s|ed|ing|ation)?\b/i,
  },
  {
    phrase: 'indicates that you have',
    instead: 'may be relevant to',
    pattern: /\bindicates?\s+that\s+you\s+have\b/i,
  },
  {
    phrase: 'this symptom comes from',
    instead: 'this signal is observed alongside',
    pattern: /\bthis\s+symptom\s+comes\s+from\b/i,
  },
  {
    phrase: 'your organ is causing this',
    instead: 'these are observed together and may be worth exploring',
    pattern: /\byour\s+organ\s+is\s+caus(ing|es)\s+this\b/i,
  },
];

export type BannedPhraseHit = {
  phrase: string;
  instead: string;
  /** The words actually found, so a warning can quote them back. */
  found: string;
};

/**
 * Every banned phrase in one piece of text, in the order the list holds
 * them. Pure, so the editor, the server and the test all get the same
 * answer for the same string.
 */
export function findBannedLanguage(text: string | null | undefined): BannedPhraseHit[] {
  if (typeof text !== 'string' || text.length === 0) return [];
  const hits: BannedPhraseHit[] = [];
  for (const rule of BANNED_PHRASES) {
    const match = rule.pattern.exec(text);
    if (match) {
      hits.push({ phrase: rule.phrase, instead: rule.instead, found: match[0] });
    }
  }
  return hits;
}

/** One sentence naming what was found, for the warning under a field. */
export function bannedLanguageWarning(hits: readonly BannedPhraseHit[]): string | null {
  if (hits.length === 0) return null;
  const quoted = hits.map((hit) => `"${hit.found}"`).join(', ');
  const suggestion = hits[0]!.instead;
  return `This feature writes in association language. Found ${quoted}. Consider ${suggestion} instead.`;
}
