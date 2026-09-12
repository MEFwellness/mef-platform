/**
 * =====================================================================
 * LAYER 1. THE VALIDATED INSTRUMENT. DO NOT EDIT WITHOUT APPROVAL.
 * =====================================================================
 *
 * The sixteen questions, the five responses, the nought to four point map,
 * the sixty four point maximum and the twenty three point reference
 * figure. This is the Nijmegen Questionnaire, and this file is the only
 * place in the app that holds any of it.
 *
 * WHY IT IS A FROZEN CONSTANT AND NOT A CONTENT TABLE. Every other scored
 * instrument in this app keeps its content in rows, because a coach
 * retuning a weight, a cut off or a band must not need a deploy. That is
 * exactly what must not be possible here. An instrument whose wording or
 * whose arithmetic can be edited from an admin screen is no longer the
 * instrument it claims to be: a score from before the edit and a score
 * from after it would sit in one member's history under one name meaning
 * two different things. Changing anything below is a reviewed code change
 * that also bumps BPC_CONTENT_VERSION, and
 * tests/breathing-check-in-instrument.test.ts fails on any change to the
 * item list, the option list, the point map or the maximum.
 *
 * WHAT THIS FILE MAY NOT CONTAIN, AND WHY THE FENCE IS A MODULE BOUNDARY.
 * No Rooted Reset framing, no member facing interpretation, no band, no
 * label, no coaching prompt and no instrument name. Those are Layer 2
 * (./copy.ts, ./signals.ts, ./coachCopy.ts), and this file imports none of
 * them, so the experience around the instrument can be rewritten entirely
 * without the instrument moving. The import direction is one way and a
 * test asserts it.
 *
 * THE PROMPTS BELOW ARE THE VALIDATED STIMULUS AND ARE SHOWN VERBATIM. No
 * gloss, no plain language rewrite, no example and no reassuring
 * parenthesis is added beside one on her screen, because anything added
 * beside the stimulus changes what she is answering.
 *
 * NO MEMBER EVER SEES A NUMBER FROM THIS FILE WHILE SHE IS ANSWERING. Her
 * results screen is a different matter as of 2026-09-12: it now prints her
 * total, the maximum and BPC_REFERENCE_THRESHOLD, all of them read through
 * ./signals.ts. Nothing in THIS file moved for that, and nothing in it may
 * move for a presentation decision: the sixteen prompts, the five labels,
 * the point map, the maximum and the reference figure are what they were.
 * A per item point is still coach facing and appears on no member screen.
 */

/** One response, its stored key, what she reads, and what it is worth. */
export type BpcScaleOption = {
  /** The value stored in her answers. Permanent: renaming one invalidates every stored sitting. */
  valueKey: string;
  /** What she reads. Validated wording. */
  label: string;
  /** Nought to four. The member is never shown this. */
  points: number;
};

/**
 * The five responses, in order, with their point values.
 *
 * ORDER IS THE SCREEN ORDER AND THE POINT ORDER AT ONCE, and they must not
 * be separated: a screen that drew these in a different order from the one
 * they score in would be asking her one question and recording another.
 */
export const BPC_SCALE: readonly BpcScaleOption[] = Object.freeze([
  Object.freeze({ valueKey: 'never', label: 'Never', points: 0 }),
  Object.freeze({ valueKey: 'rarely', label: 'Rarely', points: 1 }),
  Object.freeze({ valueKey: 'sometimes', label: 'Sometimes', points: 2 }),
  Object.freeze({ valueKey: 'often', label: 'Often', points: 3 }),
  Object.freeze({ valueKey: 'very_often', label: 'Very often', points: 4 }),
]) as readonly BpcScaleOption[];

/** The most one question can be worth. Derived, never typed twice. */
export const BPC_MAX_ITEM_POINTS = BPC_SCALE.reduce(
  (top, option) => Math.max(top, option.points),
  0
);

/** One question. */
export type BpcItem = {
  /** The stored key. Permanent: renaming one orphans every stored answer to it. */
  itemId: string;
  /** 1 to 16, the order she is asked and the order a coach reads them back. */
  position: number;
  /** The validated stimulus, shown verbatim. */
  prompt: string;
};

/**
 * The sixteen, in the instrument's own order.
 *
 * THE ORDER IS PART OF THE INSTRUMENT. It is not grouped by subject and it
 * is deliberately not reordered into the three areas her result is
 * summarised under, because a member answering a run of six questions
 * about tension answers them differently from a member meeting them spread
 * through the sixteen. ./signals.ts groups the SCORES afterwards and never
 * touches this order.
 */
export const BPC_ITEMS: readonly BpcItem[] = Object.freeze([
  Object.freeze({ itemId: 'chest_pain', position: 1, prompt: 'Chest pain' }),
  Object.freeze({ itemId: 'feeling_tense', position: 2, prompt: 'Feeling tense' }),
  Object.freeze({ itemId: 'blurred_vision', position: 3, prompt: 'Blurred vision' }),
  Object.freeze({ itemId: 'dizzy_spells', position: 4, prompt: 'Dizzy spells' }),
  Object.freeze({ itemId: 'feeling_confused', position: 5, prompt: 'Feeling confused' }),
  Object.freeze({
    itemId: 'faster_deeper_breathing',
    position: 6,
    prompt: 'Faster or deeper breathing',
  }),
  Object.freeze({ itemId: 'short_of_breath', position: 7, prompt: 'Short of breath' }),
  Object.freeze({ itemId: 'tight_chest', position: 8, prompt: 'Tight feelings in chest' }),
  Object.freeze({ itemId: 'bloated_stomach', position: 9, prompt: 'Bloated feeling in stomach' }),
  Object.freeze({ itemId: 'tingling_fingers', position: 10, prompt: 'Tingling fingers' }),
  Object.freeze({
    itemId: 'unable_to_breathe_deeply',
    position: 11,
    prompt: 'Unable to breathe deeply',
  }),
  Object.freeze({ itemId: 'stiff_fingers_arms', position: 12, prompt: 'Stiff fingers or arms' }),
  Object.freeze({ itemId: 'tight_round_mouth', position: 13, prompt: 'Tight feelings round mouth' }),
  Object.freeze({ itemId: 'cold_hands_feet', position: 14, prompt: 'Cold hands or feet' }),
  Object.freeze({ itemId: 'palpitations', position: 15, prompt: 'Palpitations' }),
  Object.freeze({ itemId: 'feelings_of_anxiety', position: 16, prompt: 'Feelings of anxiety' }),
]) as readonly BpcItem[];

/** Sixteen. Derived from the list, so the two can never disagree. */
export const BPC_ITEM_COUNT = BPC_ITEMS.length;

/** Sixty four. Derived, so a change to either half moves it correctly. */
export const BPC_MAX_SCORE = BPC_ITEM_COUNT * BPC_MAX_ITEM_POINTS;

/**
 * The traditional reference threshold published with this instrument.
 *
 * IT IS A REFERENCE POINT RATHER THAN A VERDICT, and as of 2026-09-12 both
 * sides read it. A coach sees it in the sentence beside his score
 * (./coachCopy.ts), which deliberately does not say it diagnoses anything;
 * a member sees it marked on the scale under her own total, with the one
 * line saying which side of it she falls and the sentence saying that this
 * is not a diagnosis. Neither presentation may turn it into a verdict, and
 * neither may split it into severity bands: the instrument publishes one
 * reference figure and no bands at all.
 */
export const BPC_REFERENCE_THRESHOLD = 23;

/** Her stored answers: item id to the option's stored value key. */
export type BpcAnswers = Record<string, string>;

/**
 * What a finished sitting stores.
 *
 * IT CARRIES NO BAND, NO LABEL AND NO INTERPRETATION, on purpose. Both
 * readings, hers and her coach's, are derived from this at display time by
 * Layer 2, so rewording a band never rewrites a stored result and a member
 * and her coach can never be looking at two different readings of one
 * sitting.
 */
export type BpcResults = {
  /** Nought to sixty four. */
  totalScore: number;
  /** Sixty four, stored beside the total so a later version change is visible in old rows. */
  maxScore: number;
  /** How many of the sixteen carried a usable answer. */
  answeredCount: number;
  /** Every item's own points, keyed by item id. The coach's per question column reads this. */
  itemScores: Record<string, number>;
};

const OPTION_BY_KEY: ReadonlyMap<string, BpcScaleOption> = new Map(
  BPC_SCALE.map((option) => [option.valueKey, option])
);

const ITEM_BY_ID: ReadonlyMap<string, BpcItem> = new Map(
  BPC_ITEMS.map((item) => [item.itemId, item])
);

/** The option a stored value names, or null when the scale does not hold it. */
export function bpcOption(valueKey: unknown): BpcScaleOption | null {
  return typeof valueKey === 'string' ? (OPTION_BY_KEY.get(valueKey) ?? null) : null;
}

/** The item an id names, or null. */
export function bpcItem(itemId: unknown): BpcItem | null {
  return typeof itemId === 'string' ? (ITEM_BY_ID.get(itemId) ?? null) : null;
}

/**
 * Only real item ids with a value the scale actually holds.
 *
 * Everything else is dropped rather than stored: an unknown key, a value
 * that is not on the scale, a number where a key belongs. A hand made POST
 * therefore cannot invent a seventeenth question or a sixth response, and a
 * stored answer left behind by an older version of the instrument is read
 * as unanswered rather than scored as something it never meant.
 */
export function sanitizeBpcAnswers(raw: unknown): BpcAnswers {
  const clean: BpcAnswers = {};
  if (!raw || typeof raw !== 'object') return clean;
  const source = raw as Record<string, unknown>;
  for (const item of BPC_ITEMS) {
    const value = source[item.itemId];
    if (bpcOption(value)) clean[item.itemId] = value as string;
  }
  return clean;
}

/** Every item she has not answered yet, in the instrument's own order. */
export function unansweredBpcItems(answers: BpcAnswers): BpcItem[] {
  return BPC_ITEMS.filter((item) => !bpcOption(answers[item.itemId]));
}

/** How many of the sixteen carry a usable answer. */
export function answeredBpcCount(answers: BpcAnswers): number {
  return BPC_ITEMS.reduce((count, item) => (bpcOption(answers[item.itemId]) ? count + 1 : count), 0);
}

/** True when every one of the sixteen has been answered. */
export function isBpcComplete(answers: BpcAnswers): boolean {
  return answeredBpcCount(answers) === BPC_ITEM_COUNT;
}

/**
 * THE SCORE. One function, and the only place the total is ever computed.
 *
 * An unanswered item contributes nothing, which is the instrument's own
 * behaviour and is why answeredCount is stored beside the total: a total
 * of eleven out of sixteen answered is a different fact from a total of
 * eleven out of sixteen, and a surface that printed one as the other would
 * be reporting a low burden where there is an unfinished sitting.
 */
export function scoreBpcAnswers(raw: unknown): BpcResults {
  const answers = sanitizeBpcAnswers(raw);
  const itemScores: Record<string, number> = {};
  let totalScore = 0;
  let answeredCount = 0;

  for (const item of BPC_ITEMS) {
    const option = bpcOption(answers[item.itemId]);
    if (!option) continue;
    itemScores[item.itemId] = option.points;
    totalScore += option.points;
    answeredCount += 1;
  }

  return { totalScore, maxScore: BPC_MAX_SCORE, answeredCount, itemScores };
}

/** A stored results object, or null when the row holds something else. */
export function parseBpcResults(raw: unknown): BpcResults | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.totalScore !== 'number' || !Number.isFinite(value.totalScore)) return null;
  if (typeof value.maxScore !== 'number' || !Number.isFinite(value.maxScore)) return null;
  if (typeof value.answeredCount !== 'number' || !Number.isFinite(value.answeredCount)) return null;

  const itemScores: Record<string, number> = {};
  if (value.itemScores && typeof value.itemScores === 'object') {
    for (const [key, points] of Object.entries(value.itemScores as Record<string, unknown>)) {
      if (bpcItem(key) && typeof points === 'number' && Number.isFinite(points)) {
        itemScores[key] = points;
      }
    }
  }

  return {
    totalScore: value.totalScore,
    maxScore: value.maxScore,
    answeredCount: value.answeredCount,
    itemScores,
  };
}
