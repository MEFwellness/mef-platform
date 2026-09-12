/**
 * =====================================================================
 * LAYER 2. HER READING. The Rooted Reset interpretation of a score.
 * =====================================================================
 *
 * WHAT THIS TURNS A NUMBER INTO. Her own total out of sixty four, whether
 * it sits above or below the traditional reference threshold, the handful
 * of answers that came back highest, one status statement, and three named
 * signal areas each carrying a plain phrase.
 *
 * SHE IS SHOWN HER SCORE, AND THAT IS A DELIBERATE REVERSAL. This
 * experience shipped on 2026-09-12 with a member view that had no field a
 * number could sit in, and a guard that asserted the serialised payload
 * held no digit at all. The decision since is that a member reading her
 * own instrument is better served by the number plus the sentences that
 * bound it than by the sentences alone, so the total, the maximum and the
 * reference threshold are carried here on purpose.
 * tests/breathing-check-in-results.test.tsx now asserts they RENDER, and
 * the old absence guard is gone rather than merely disabled, so nothing in
 * the suite claims two different things about one screen.
 *
 * WHAT IS STILL FENCED. The NAME of the underlying instrument, the coach's
 * score sentence and the coaching prompt library stay in ./coachCopy.ts
 * and ./coachView.ts, which no member surface may import.
 * tests/breathing-check-in-layers.test.tsx still walks the import graph of
 * every member facing file and fails if any path reaches either.
 *
 * IT CHANGES NO ARITHMETIC, AND THE FENCE IS STRUCTURAL. This module is
 * handed a finished BpcResults and reads it. It cannot score, it cannot
 * re-weight and it cannot drop an item, because it never sees an answer:
 * scoreBpcAnswers has already run and this takes its output. Rewriting
 * every band and every phrase below moves the total by nothing.
 *
 * THE THREE AREAS ARE A PRESENTATION GROUPING, NOT A SUBSCALE OF THE
 * INSTRUMENT. The instrument publishes one total and no subscales. These
 * three exist so a member reads something more useful than one sentence,
 * and every one of the sixteen items belongs to exactly one of them, so
 * the three areas together account for the whole instrument and none of
 * them can double count. A test asserts the partition: sixteen items, no
 * item in two areas, no item in none, and the three area maxima summing to
 * the instrument's own maximum.
 *
 * A COUNTED CLAIM NAMES ITS WINDOW. Nothing here counts days or
 * occurrences. The only window in this experience is the one the question
 * itself names ("over the past few weeks"), and it is said on the question
 * screen rather than invented here.
 *
 * NO DIAGNOSIS, NO CAUSATION, NO CONDITION. Nothing below names
 * dysfunctional breathing, hyperventilation, anxiety, a disorder or a
 * disease, and nothing below says one thing causes another. A test scans
 * every string in this file for both.
 *
 * NO EM DASHES.
 */

import {
  BPC_ITEMS,
  BPC_MAX_ITEM_POINTS,
  BPC_MAX_SCORE,
  BPC_REFERENCE_THRESHOLD,
  BPC_SCALE,
  type BpcResults,
} from './instrument';

/**
 * The three areas, and which items are read into each.
 *
 * THE MEMBERSHIP IS EDITORIAL AND IT IS STATED IN ONE PLACE. An item is
 * filed under the area a member would recognise it as belonging to when
 * she reads the area's name, not under a clinical grouping she is not
 * shown. Moving one is a one line change here, and the partition test
 * keeps it honest.
 */
export type BpcSignalArea = {
  areaKey: string;
  /** What she reads as the area's name. */
  displayName: string;
  /** The item ids read into it. Every item appears in exactly one area. */
  itemIds: readonly string[];
};

export const BPC_SIGNAL_AREAS: readonly BpcSignalArea[] = [
  {
    areaKey: 'breathing',
    displayName: 'Breathing sensations',
    itemIds: [
      'faster_deeper_breathing',
      'short_of_breath',
      'tight_chest',
      'unable_to_breathe_deeply',
    ],
  },
  {
    areaKey: 'tension',
    displayName: 'Tension signals',
    itemIds: [
      'chest_pain',
      'feeling_tense',
      'stiff_fingers_arms',
      'tight_round_mouth',
      'palpitations',
      'feelings_of_anxiety',
    ],
  },
  {
    areaKey: 'body',
    displayName: 'Body sensations',
    itemIds: [
      'blurred_vision',
      'dizzy_spells',
      'feeling_confused',
      'bloated_stomach',
      'tingling_fingers',
      'cold_hands_feet',
    ],
  },
] as const;

/**
 * The three phrases an area can carry, from quietest to loudest.
 *
 * WORDS RATHER THAN A BAR, and no number beside them. "Speaking louder"
 * says that this group of sensations came back higher than the others
 * without telling her how high, which is the line this layer holds: enough
 * for a conversation, not enough to self-assess.
 */
export const BPC_AREA_PHRASES = {
  quiet: 'Mostly quiet',
  showing: 'Showing up',
  louder: 'Speaking louder',
} as const;

export type BpcAreaPhrase = (typeof BPC_AREA_PHRASES)[keyof typeof BPC_AREA_PHRASES];

/**
 * Where an area's phrase changes, as a share of that area's own maximum.
 *
 * A SHARE RATHER THAN A COUNT, because the three areas hold four, six and
 * six items, and a fixed point cut off would make the four item area
 * shout at a lower burden than the six item ones.
 */
const AREA_SHOWING_SHARE = 0.25;
const AREA_LOUDER_SHARE = 0.5;

/** One area as her screen prints it. */
export type BpcAreaReading = {
  areaKey: string;
  displayName: string;
  phrase: BpcAreaPhrase;
  /**
   * Nought to one hundred. FOR LAYOUT ONLY, and only on the coach's side.
   * Her own screen draws the phrase and never this, which is why the
   * member view below does not carry it.
   */
  sharePercent: number;
};

/** Every item's maximum contribution to its area. Derived from the instrument. */
function areaMaxPoints(area: BpcSignalArea): number {
  return area.itemIds.length * BPC_MAX_ITEM_POINTS;
}

/** What one area's items came back as, out of what that area could hold. */
function areaPoints(area: BpcSignalArea, results: BpcResults): number {
  return area.itemIds.reduce((sum, itemId) => sum + (results.itemScores[itemId] ?? 0), 0);
}

function phraseForShare(share: number): BpcAreaPhrase {
  if (share >= AREA_LOUDER_SHARE) return BPC_AREA_PHRASES.louder;
  if (share >= AREA_SHOWING_SHARE) return BPC_AREA_PHRASES.showing;
  return BPC_AREA_PHRASES.quiet;
}

/** The three areas, in their own order, as a reading. */
export function bpcAreaReadings(results: BpcResults): BpcAreaReading[] {
  return BPC_SIGNAL_AREAS.map((area) => {
    const max = areaMaxPoints(area);
    const share = max > 0 ? areaPoints(area, results) / max : 0;
    return {
      areaKey: area.areaKey,
      displayName: area.displayName,
      phrase: phraseForShare(share),
      sharePercent: Math.round(share * 100),
    };
  });
}

/**
 * The one status statement at the top of her result.
 *
 * FOUR BANDS, AND THEY ARE THIS LAYER'S OWN EDITORIAL CHOICE. They are not
 * the instrument's, because the instrument publishes no bands: it
 * publishes one reference figure, which is coach facing and is never shown
 * to her. Moving a boundary below rewords her screen and moves no total.
 *
 * EVERY SENTENCE IS ABOUT WHAT HER ANSWERS DESCRIBE, never about what she
 * has. "Signals are showing up" is a statement about the responses she
 * gave. "You have a breathing problem" would be a statement about her
 * body, and this layer is not allowed to make one.
 */
export type BpcMemberBand = {
  bandKey: string;
  /** The inclusive lower bound of the band, on the instrument's own nought to sixty four total. */
  minScore: number;
  statement: string;
  supportingLine: string;
};

export const BPC_MEMBER_BANDS: readonly BpcMemberBand[] = [
  {
    bandKey: 'quiet',
    minScore: 0,
    statement: 'Your breathing signals are quiet right now.',
    supportingLine:
      'Your responses suggest that breathing, tension, and body sensations are not asking for much of your attention at the moment.',
  },
  {
    bandKey: 'few',
    minScore: 11,
    statement: 'A few breathing-related signals are showing up.',
    supportingLine:
      'Your responses suggest a handful of sensations worth keeping an eye on, and a pattern your coach can help you read.',
  },
  {
    bandKey: 'some',
    minScore: 23,
    statement: 'Some breathing-related signals are showing up.',
    supportingLine:
      'Your responses suggest that breathing, tension, and body sensations may be interacting more than you realize.',
  },
  {
    bandKey: 'clear',
    minScore: 40,
    statement: 'Breathing-related signals are showing up clearly.',
    supportingLine:
      'Your responses suggest that breathing, tension, and body sensations are showing up together often enough to be worth a real conversation with your coach.',
  },
] as const;

/** The band a total falls in. The highest band whose lower bound it reaches. */
export function bpcMemberBand(totalScore: number): BpcMemberBand {
  let chosen = BPC_MEMBER_BANDS[0]!;
  for (const band of BPC_MEMBER_BANDS) {
    if (totalScore >= band.minScore) chosen = band;
  }
  return chosen;
}

/**
 * =====================================================================
 * WHAT SHE ANSWERED HIGHEST. Plain names, and her own frequency word.
 * =====================================================================
 */

/**
 * The sixteen, in the words a member reads them back in.
 *
 * THESE ARE NOT THE VALIDATED STIMULUS AND THEY NEVER REPLACE IT. The
 * prompts in ./instrument.ts are what she ANSWERS, verbatim, and nothing
 * here can reach them. These are what a finished result CALLS the same
 * thing afterwards, in ordinary language, because "Tight feelings round
 * mouth" is a stimulus and "Tightness around the mouth" is a sentence.
 * Rewriting any of them moves no answer and no point.
 *
 * A test asserts there is exactly one of these for each of the sixteen, so
 * an item added to the instrument cannot reach her screen unnamed.
 */
export const BPC_MEMBER_ITEM_NAMES: Readonly<Record<string, string>> = Object.freeze({
  chest_pain: 'Pain in the chest',
  feeling_tense: 'Feeling tense',
  blurred_vision: 'Blurred vision',
  dizzy_spells: 'Dizziness',
  feeling_confused: 'Feeling foggy or unclear',
  faster_deeper_breathing: 'Faster or deeper breathing',
  short_of_breath: 'Feeling short of breath',
  tight_chest: 'Tightness in the chest',
  bloated_stomach: 'A bloated feeling in the stomach',
  tingling_fingers: 'Tingling in the fingers',
  unable_to_breathe_deeply: 'Not being able to breathe deeply',
  stiff_fingers_arms: 'Stiffness in the fingers or arms',
  tight_round_mouth: 'Tightness around the mouth',
  cold_hands_feet: 'Cold hands or feet',
  palpitations: 'A racing or pounding heartbeat',
  feelings_of_anxiety: 'Feeling anxious',
});

/**
 * How high an answer has to be before it counts as one of her strongest.
 *
 * THREE, WHICH IS "Often" AND ABOVE, and it is defined HERE rather than
 * beside the coach's list because both lists must mean the same thing.
 * ./coachView.ts imports this one. A list that included "Sometimes" would
 * be most of the sixteen on a busy sitting and would stop being a list of
 * what stood out, and a plain "top three" would promote three ones on a
 * quiet sitting and read as though something stood out when nothing did.
 */
export const BPC_STRONGEST_MIN_POINTS = 3;

/** At most four, so the section stays a short list rather than a table. */
export const BPC_STRONGEST_MAX = 4;

/** The frequency word a point value belongs to, or null when nothing on the scale carries it. */
export function bpcFrequencyLabelForPoints(points: number): string | null {
  return BPC_SCALE.find((option) => option.points === points)?.label ?? null;
}

/** One line of her strongest signals list. */
export type BpcStrongestSignal = {
  itemId: string;
  /** Plain member language, from BPC_MEMBER_ITEM_NAMES. */
  name: string;
  /** Her own frequency answer, exactly as she read it while answering. */
  frequencyLabel: string;
  /** What it was worth. Decides the ordering. Not printed beside the pair. */
  points: number;
};

/**
 * The answers she gave highest, strongest first.
 *
 * TIES KEEP THE INSTRUMENT'S OWN ORDER, so one sitting reads the same way
 * on every render rather than reshuffling. It reads results.itemScores
 * rather than her raw answers, so the frequency word printed beside a name
 * is derived from the same stored points the total was summed from: one
 * source, and no way for the word and the number to disagree.
 */
type BpcRankedSignal = BpcStrongestSignal & { position: number };

export function bpcStrongestSignals(
  results: BpcResults,
  limit: number = BPC_STRONGEST_MAX
): BpcStrongestSignal[] {
  const ranked: BpcRankedSignal[] = [];

  for (const item of BPC_ITEMS) {
    const points = results.itemScores[item.itemId];
    if (typeof points !== 'number' || points < BPC_STRONGEST_MIN_POINTS) continue;
    const frequencyLabel = bpcFrequencyLabelForPoints(points);
    if (!frequencyLabel) continue;
    ranked.push({
      itemId: item.itemId,
      position: item.position,
      name: BPC_MEMBER_ITEM_NAMES[item.itemId] ?? item.itemId,
      frequencyLabel,
      points,
    });
  }

  return ranked
    .sort((a, b) => (b.points === a.points ? a.position - b.position : b.points - a.points))
    .slice(0, Math.max(0, limit))
    .map(({ itemId, name, frequencyLabel, points }) => ({ itemId, name, frequencyLabel, points }));
}

/**
 * EVERYTHING HER RESULTS SCREEN IS HANDED.
 *
 * IT CARRIES HER SCORE ON PURPOSE. The total, the maximum and the
 * traditional reference threshold are all here, because her screen now
 * prints all three: the number, the bar it sits on, and the one line
 * saying which side of the reference figure it falls. That is a reversal
 * of how this experience shipped, and the reversal is deliberate.
 *
 * WHAT IS STILL NOT HERE. The instrument's own NAME, the coach's score
 * sentence, the coaching prompt library and the per item point column. She
 * gets her strongest answers as a name and a frequency word, which is what
 * a conversation needs, and never as a scored table.
 */
export type BpcMemberView = {
  /** Nought to sixty four, exactly the stored total. */
  totalScore: number;
  /** Sixty four. Read from the stored result rather than recomputed. */
  maxScore: number;
  /** Twenty three. The published reference figure her screen marks on the bar. */
  referenceThreshold: number;
  /** True at the threshold itself and above it. */
  aboveThreshold: boolean;
  statement: string;
  supportingLine: string;
  /** Nought to four of them. Empty when nothing came back at the higher end. */
  strongest: { itemId: string; name: string; frequencyLabel: string }[];
  areas: { areaKey: string; displayName: string; phrase: BpcAreaPhrase }[];
};

/** Whether a total reaches the published reference figure. One rule, read by both sides. */
export function bpcAtOrAboveReferenceThreshold(totalScore: number): boolean {
  return totalScore >= BPC_REFERENCE_THRESHOLD;
}

export function buildBpcMemberView(results: BpcResults): BpcMemberView {
  const band = bpcMemberBand(results.totalScore);
  return {
    totalScore: results.totalScore,
    maxScore: results.maxScore,
    referenceThreshold: BPC_REFERENCE_THRESHOLD,
    aboveThreshold: bpcAtOrAboveReferenceThreshold(results.totalScore),
    statement: band.statement,
    supportingLine: band.supportingLine,
    strongest: bpcStrongestSignals(results).map(({ itemId, name, frequencyLabel }) => ({
      itemId,
      name,
      frequencyLabel,
    })),
    areas: bpcAreaReadings(results).map((area) => ({
      areaKey: area.areaKey,
      displayName: area.displayName,
      phrase: area.phrase,
    })),
  };
}

/**
 * The partition check, exported so the test asserts the real thing rather
 * than a retyped copy of it.
 *
 * Returns the items that are in no area and the ones that are in more than
 * one. Both must be empty, or the three areas are lying about accounting
 * for the instrument.
 */
export function bpcAreaPartitionProblems(): { missing: string[]; duplicated: string[] } {
  const seen = new Map<string, number>();
  for (const area of BPC_SIGNAL_AREAS) {
    for (const itemId of area.itemIds) seen.set(itemId, (seen.get(itemId) ?? 0) + 1);
  }
  const missing = BPC_ITEMS.filter((item) => !seen.has(item.itemId)).map((item) => item.itemId);
  const duplicated = [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  return { missing, duplicated };
}

/** The three area maxima summed. Equals the instrument's own maximum, or the partition is wrong. */
export function bpcAreaMaxTotal(): number {
  return BPC_SIGNAL_AREAS.reduce((sum, area) => sum + areaMaxPoints(area), 0);
}

/** Exported so the partition test can compare against the instrument rather than a literal. */
export const BPC_INSTRUMENT_MAX_FOR_PARTITION = BPC_MAX_SCORE;
