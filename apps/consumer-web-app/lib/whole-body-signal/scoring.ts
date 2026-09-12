/**
 * The arithmetic. Pure, deterministic, and no AI provider anywhere near it.
 *
 * RESPONSE CONVERSION IS A LOOKUP, NOT A SUBTRACTION. Every scale option
 * carries both of its point values as stored columns, so a direct question
 * reads `directPoints` and a reverse question reads `reversePoints`.
 * Nothing here knows what the top of the scale is, which is what lets a
 * coach retune the scale without a deploy. THE MEMBER NEVER SEES ANY
 * DIFFERENCE: the five options read identically on every screen.
 *
 * THE MAXIMUM COUNTS ONLY THE QUESTIONS THIS MEMBER WAS SHOWN. Section 8's
 * branch decides which of its questions she is asked, and a Prefer not to
 * answer tap leaves BOTH sides of the fraction, so nobody is penalised or
 * falsely quietened by a question that was never put to her or that she
 * declined.
 *
 * A SECTION WITH NOTHING TO DIVIDE BY IS ZERO, NOT AN ERROR, and its own
 * answeredCount says plainly that it was built from nothing. It is left
 * out of the Signal Load entirely, because averaging in a section nobody
 * answered would quietly drag the whole number down.
 *
 * THE ZONE ROLLUP IS QUESTION LEVEL, NEVER SECTION LEVEL. Each answered
 * question contributes its own nought to four signal score to its primary
 * Zone at full weight and to its secondary Zone at half. A Zone percentage
 * is contributed points over contributable points for the questions this
 * member actually answered, which is why two members who answered
 * different branches can still be read on the same scale.
 */

import {
  PNTA_VALUE,
} from './constants';
import type {
  MemberQuestion,
  ReadingQuestion,
  ScaleOption,
  SectionResult,
  SignalBand,
  SignalLoad,
  BranchRule,
  WbsAnswers,
  ZoneResult,
} from './types';

/** How much a secondary Zone tag contributes, against a primary tag's full weight. */
export const SECONDARY_ZONE_WEIGHT = 0.5;
export const PRIMARY_ZONE_WEIGHT = 1;

/**
 * Which questions this member is shown.
 *
 * THREE KINDS, and the rule reads off the row rather than off a section
 * key, so a second branching section added later needs no code change:
 *
 *   no branch group        asked of everybody, always.
 *   universal              asked of everybody who has answered the routing
 *                          question, whatever they answered, including
 *                          Prefer not to answer.
 *   a branch group         asked only when the rule for her own routing
 *                          answer names it.
 *
 * A null routing answer shows neither kind of Section 8 question, which is
 * the honest state for a member on section three: she has not been asked
 * yet, so nothing there can be part of her maximum.
 */
export function shownQuestions<T extends MemberQuestion>(
  questions: readonly T[],
  routingOptionKey: string | null,
  branchRules: readonly BranchRule[]
): T[] {
  const opened = new Set(
    routingOptionKey
      ? (branchRules.find((rule) => rule.optionKey === routingOptionKey)?.questionRefs ?? [])
      : []
  );
  return questions
    .filter((question) => {
      if (question.branchGroup === null) return true;
      if (routingOptionKey === null) return false;
      if (question.isUniversal) return true;
      return opened.has(question.questionRef);
    })
    .slice()
    .sort((a, b) => a.position - b.position);
}

/** The questions of one section that this member is shown, in their fixed order. */
export function shownQuestionsInSection<T extends MemberQuestion>(
  questions: readonly T[],
  sectionKey: string,
  routingOptionKey: string | null,
  branchRules: readonly BranchRule[]
): T[] {
  return shownQuestions(questions, routingOptionKey, branchRules).filter(
    (question) => question.sectionKey === sectionKey
  );
}

/** The option she picked, or null for a Prefer not to answer tap or an unreadable value. */
export function optionFor(
  scale: readonly ScaleOption[],
  value: string | undefined
): ScaleOption | null {
  if (!value || value === PNTA_VALUE) return null;
  return scale.find((option) => option.valueKey === value) ?? null;
}

/** One answer converted to its nought to four signal score. */
export function signalPoints(option: ScaleOption, direction: 'direct' | 'reverse'): number {
  return direction === 'reverse' ? option.reversePoints : option.directPoints;
}

/** The most one answered question can contribute. Read off the scale, never assumed to be four. */
export function maxSignalPoints(scale: readonly ScaleOption[]): number {
  return scale.reduce(
    (highest, option) => Math.max(highest, option.directPoints, option.reversePoints),
    0
  );
}

/**
 * Her signal score for one question, or null when she did not answer it or
 * chose Prefer not to answer.
 */
export function answerSignal(
  question: ReadingQuestion,
  scale: readonly ScaleOption[],
  answers: WbsAnswers
): number | null {
  const option = optionFor(scale, answers[question.questionRef]);
  if (!option) return null;
  return signalPoints(option, question.direction);
}

/**
 * The band a rounded percentage falls in.
 *
 * min is inclusive, max is exclusive, and the loudest band leaves max
 * null. Bands are read in their stored order so a coach who retunes the
 * cut offs gets exactly what he typed.
 */
export function bandForPercent(bands: readonly SignalBand[], percent: number): SignalBand {
  const ordered = bands.slice().sort((a, b) => a.position - b.position);
  for (const band of ordered) {
    const aboveFloor = percent >= band.minPercent;
    const belowCeiling = band.maxPercent === null || percent < band.maxPercent;
    if (aboveFloor && belowCeiling) return band;
  }
  // Unreachable with well formed bands. Falling back to the quietest one
  // rather than throwing, because a page a member is waiting on must not
  // die over a mistyped cut off, and the quietest band is the one that
  // claims least about her.
  return ordered[0]!;
}

/** One section's arithmetic. */
export function scoreSection(input: {
  questions: readonly ReadingQuestion[];
  scale: readonly ScaleOption[];
  bands: readonly SignalBand[];
  branchRules: readonly BranchRule[];
  answers: WbsAnswers;
  sectionKey: string;
  routingOptionKey: string | null;
}): SectionResult {
  const asked = shownQuestionsInSection(
    input.questions,
    input.sectionKey,
    input.routingOptionKey,
    input.branchRules
  );
  const perQuestionMax = maxSignalPoints(input.scale);

  let points = 0;
  let possible = 0;
  let answeredCount = 0;
  let pntaCount = 0;

  for (const question of asked) {
    const raw = input.answers[question.questionRef];
    if (raw === PNTA_VALUE) {
      pntaCount += 1;
      continue;
    }
    const option = optionFor(input.scale, raw);
    if (!option) continue;
    points += signalPoints(option, question.direction);
    possible += perQuestionMax;
    answeredCount += 1;
  }

  const percent = possible > 0 ? Math.round((points / possible) * 100) : 0;
  return {
    sectionKey: input.sectionKey,
    points,
    possible,
    percent,
    bandKey: bandForPercent(input.bands, percent).bandKey,
    answeredCount,
    pntaCount,
  };
}

/**
 * Every section, loudest first.
 *
 * Ties are broken by the section's own fixed position, so two sections on
 * the same percentage are always in the same order for the same member and
 * the order does not shuffle between her screen and her coach's.
 */
export function buildSectionResults(input: {
  sections: readonly { sectionKey: string; position: number }[];
  questions: readonly ReadingQuestion[];
  scale: readonly ScaleOption[];
  bands: readonly SignalBand[];
  branchRules: readonly BranchRule[];
  answers: WbsAnswers;
  routingOptionKey: string | null;
}): SectionResult[] {
  const positionOf = new Map(input.sections.map((section) => [section.sectionKey, section.position]));
  const results = input.sections
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((section) =>
      scoreSection({
        questions: input.questions,
        scale: input.scale,
        bands: input.bands,
        branchRules: input.branchRules,
        answers: input.answers,
        sectionKey: section.sectionKey,
        routingOptionKey: input.routingOptionKey,
      })
    );

  results.sort((a, b) => {
    if (b.percent !== a.percent) return b.percent - a.percent;
    return (positionOf.get(a.sectionKey) ?? 0) - (positionOf.get(b.sectionKey) ?? 0);
  });
  return results;
}

/**
 * The Zone rollup, built from ANSWERS.
 *
 * A Zone nobody could contribute to is left out rather than reported at
 * nought, because "no question this member answered touches Zone 4" and
 * "Zone 4 is quiet" are different facts and only one of them is true.
 */
export function buildZoneResults(input: {
  questions: readonly ReadingQuestion[];
  scale: readonly ScaleOption[];
  branchRules: readonly BranchRule[];
  answers: WbsAnswers;
  routingOptionKey: string | null;
  /** Fixed display order, so two Zones on the same percentage never swap places. */
  zoneOrder: readonly { zoneKey: string; position: number }[];
}): ZoneResult[] {
  const perQuestionMax = maxSignalPoints(input.scale);
  const asked = shownQuestions(input.questions, input.routingOptionKey, input.branchRules);

  const points = new Map<string, number>();
  const possible = new Map<string, number>();

  function add(zoneKey: string, score: number, weight: number) {
    points.set(zoneKey, (points.get(zoneKey) ?? 0) + score * weight);
    possible.set(zoneKey, (possible.get(zoneKey) ?? 0) + perQuestionMax * weight);
  }

  for (const question of asked) {
    const score = answerSignal(question, input.scale, input.answers);
    // A Prefer not to answer, and an unanswered question, contribute
    // nothing to any Zone AND nothing to any Zone's maximum.
    if (score === null) continue;
    add(question.primaryZoneKey, score, PRIMARY_ZONE_WEIGHT);
    if (question.secondaryZoneKey) {
      add(question.secondaryZoneKey, score, SECONDARY_ZONE_WEIGHT);
    }
  }

  const positionOf = new Map(input.zoneOrder.map((zone) => [zone.zoneKey, zone.position]));
  const results: ZoneResult[] = [];
  for (const [zoneKey, max] of possible.entries()) {
    if (max <= 0) continue;
    const earned = points.get(zoneKey) ?? 0;
    results.push({
      zoneKey,
      points: earned,
      possible: max,
      percent: Math.round((earned / max) * 100),
    });
  }

  results.sort((a, b) => {
    if (b.percent !== a.percent) return b.percent - a.percent;
    return (positionOf.get(a.zoneKey) ?? 0) - (positionOf.get(b.zoneKey) ?? 0);
  });
  return results;
}

/** One decimal place, which is the precision the coach's screen prints. */
function oneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The Whole-Body Signal Load.
 *
 *   A = the mean of all section percentages
 *   B = the share of sections at the elevated threshold or above, as a percentage
 *   C = the mean of the highest section percentages
 *   Load = (0.60 x A) + (0.25 x B) + (0.15 x C), rounded to a whole number
 *
 * THE THREE WEIGHTS AND THE THRESHOLD ARE STORED ROWS, not literals here.
 *
 * THE COMPONENTS ARE STORED AT ONE DECIMAL AND THE LOAD IS COMPUTED FROM
 * THE UNROUNDED ONES. One decimal is what a coach reads; rounding before
 * combining would make the printed components and the printed load
 * disagree by a point at the margins, which is exactly the kind of thing a
 * coach notices and nobody can then explain.
 *
 * A SECTION NOBODY ANSWERED IS NOT IN ANY OF THE THREE. It has no
 * percentage to average, it cannot be elevated, and counting it in the
 * denominator of B would report a member as less loaded for a section she
 * was never asked about.
 */
export function buildSignalLoad(input: {
  sections: readonly SectionResult[];
  weightA: number;
  weightB: number;
  weightC: number;
  elevatedMinPercent: number;
  topComponentCount: number;
}): SignalLoad {
  const scorable = input.sections.filter((section) => section.possible > 0);
  if (scorable.length === 0) {
    return { value: 0, componentA: 0, componentB: 0, componentC: 0 };
  }

  const percentages = scorable.map((section) => section.percent);
  const a = percentages.reduce((sum, value) => sum + value, 0) / percentages.length;

  const elevated = percentages.filter((value) => value >= input.elevatedMinPercent).length;
  const b = (elevated / percentages.length) * 100;

  const top = percentages
    .slice()
    .sort((x, y) => y - x)
    .slice(0, Math.max(1, input.topComponentCount));
  const c = top.reduce((sum, value) => sum + value, 0) / top.length;

  const value = Math.round(input.weightA * a + input.weightB * b + input.weightC * c);

  return {
    value,
    componentA: oneDecimal(a),
    componentB: oneDecimal(b),
    componentC: oneDecimal(c),
  };
}
