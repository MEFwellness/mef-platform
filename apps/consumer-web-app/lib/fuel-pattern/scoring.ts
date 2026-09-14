/**
 * Rooted Reset Fuel Pattern Assessment — the scoring engine.
 *
 * THREE DIRECTIONS, NEVER A DIAGNOSIS. Protein-Supportive, Balanced Fuel
 * and Carb-Supportive are internal scoring directions. The raw scores are
 * for the coach view (Build 2) and are never shown to a member, and the
 * language on every member screen stays observational: her responses
 * SUGGEST a starting pattern. Nothing here claims anything about her
 * metabolism, her biology or her requirements.
 *
 * THE WEIGHTS, in one place, read off each option's own authored class in
 * questionContent.ts rather than restated here:
 *
 *   protein    Protein +2, Balanced +1, Carb +0
 *   balanced   Protein +1, Balanced +2, Carb +1
 *   carb       Protein +0, Balanced +1, Carb +2
 *   neutral    0, 0, 0. Counts toward the zero weight share.
 *   tendency   0, 0, 0. Counts toward the zero weight share, and the
 *              option's tendency code is stored on her result.
 *   unscored   Not scored and not counted in any denominator: Question
 *              21's digestive discomfort option and all of Question 23.
 *
 * FLEXIBLE FUEL IS A RESULT, NOT A FAILURE. It is what the instrument
 * says when her answers genuinely do not separate, and both routes to it
 * are stated in FLEXIBLE_LEAD_THRESHOLD and FLEXIBLE_ZERO_SHARE below.
 */

import type {
  FpaConfidence,
  FpaScores,
  FpaScoring,
  FuelDirection,
  FuelPattern,
} from './types';
import { FPA_QUESTIONS, fpaOption } from './questionContent';
import {
  FPA_DIGESTION_QUESTION_KEY,
  FPA_DIGESTIVE_DISCOMFORT_VALUE,
  FPA_VITALITY_QUESTION_KEY,
} from './constants';

/** Protein, Balanced, Carb, in that order, for each scoring class. */
const POINTS: Record<'protein' | 'balanced' | 'carb', [number, number, number]> = {
  protein: [2, 1, 0],
  balanced: [1, 2, 1],
  carb: [0, 1, 2],
};

/** The top score has to lead the second by at least this share of itself. */
export const FLEXIBLE_LEAD_THRESHOLD = 0.2;
/** At or above this share of zero weight answers, the result is Flexible Fuel whatever the scores say. */
export const FLEXIBLE_ZERO_SHARE = 0.4;

/** Confidence thresholds, stated once so the report and the code cannot disagree. */
export const CONFIDENCE_THRESHOLDS = {
  directional: {
    high: { minLead: 0.35, maxZeroShare: 0.2 },
    moderate: { minLead: 0.2, maxZeroShare: 0.35 },
  },
  flexible: {
    high: { maxLead: 0.1, maxZeroShare: 0.2 },
    moderate: { maxZeroShare: 0.4 },
  },
} as const;

/** Every question that takes part in scoring: Q1 to Q22 and Q24. Question 23 is not one of them. */
export const FPA_SCORED_QUESTION_KEYS: string[] = FPA_QUESTIONS.filter(
  (q) => q.key !== FPA_VITALITY_QUESTION_KEY
).map((q) => q.key);

const DIRECTIONS: FuelDirection[] = ['protein', 'balanced', 'carb'];

const PATTERN_FOR_DIRECTION: Record<FuelDirection, FuelPattern> = {
  protein: 'protein_supportive',
  balanced: 'balanced_fuel',
  carb: 'carb_supportive',
};

/** True once every question a member must answer has an answer. Question 23 is required like the rest, because "Prefer not to answer" is one of its own options. */
export function allFpaQuestionsAnswered(answers: Record<string, unknown>): boolean {
  return FPA_QUESTIONS.every((q) => typeof answers[q.key] === 'string' && answers[q.key] !== '');
}

export function computeFpaScoring(answers: Record<string, unknown>): FpaScoring {
  const scores: FpaScores = { protein: 0, balanced: 0, carb: 0 };
  const tendencies: string[] = [];
  const responses: Record<string, string> = {};
  let scoredQuestionCount = 0;
  let zeroWeightCount = 0;

  for (const question of FPA_QUESTIONS) {
    const raw = answers[question.key];
    if (typeof raw !== 'string' || raw === '') continue;
    responses[question.key] = raw;

    const option = fpaOption(question.key, raw);
    // An answer the content does not know about scores nothing and is not
    // counted, rather than silently landing in one of the three
    // directions. tests/fuel-pattern-content.test.ts is what keeps this
    // branch unreachable in practice.
    if (!option) continue;

    if (question.key === FPA_VITALITY_QUESTION_KEY) continue;
    if (option.weight === 'unscored') continue;

    scoredQuestionCount += 1;

    if (option.weight === 'neutral' || option.weight === 'tendency') {
      zeroWeightCount += 1;
      if (option.weight === 'tendency' && option.tendency) tendencies.push(option.tendency);
      continue;
    }

    const [p, b, c] = POINTS[option.weight];
    scores.protein += p;
    scores.balanced += b;
    scores.carb += c;
  }

  const ranked = [...DIRECTIONS].sort((a, b) => scores[b] - scores[a]);
  const top = scores[ranked[0]!];
  const second = scores[ranked[1]!];
  const leadShare = top > 0 ? (top - second) / top : 0;
  const zeroWeightShare = scoredQuestionCount > 0 ? zeroWeightCount / scoredQuestionCount : 0;

  const flexible =
    scoredQuestionCount === 0 ||
    top === 0 ||
    zeroWeightShare >= FLEXIBLE_ZERO_SHARE ||
    leadShare < FLEXIBLE_LEAD_THRESHOLD;

  const pattern: FuelPattern = flexible ? 'flexible_fuel' : PATTERN_FOR_DIRECTION[ranked[0]!];
  const confidence = computeConfidence(pattern, leadShare, zeroWeightShare);

  const vitalityRaw = answers[FPA_VITALITY_QUESTION_KEY];
  const vitalityResponse = typeof vitalityRaw === 'string' && vitalityRaw !== '' ? vitalityRaw : null;

  return {
    pattern,
    confidence,
    scores,
    scoredQuestionCount,
    zeroWeightCount,
    zeroWeightShare,
    leadShare,
    tendencies,
    digestiveDiscomfort: answers[FPA_DIGESTION_QUESTION_KEY] === FPA_DIGESTIVE_DISCOMFORT_VALUE,
    vitalityResponse,
    responses,
  };
}

/**
 * HOW SURE THE INSTRUMENT IS, and it says so about itself rather than
 * about her. A directional result earns its confidence from how far the
 * top score stands clear of the next one and from how much of the
 * instrument actually scored. A Flexible Fuel result is read the other
 * way round: a member who answered decisively and still sits between the
 * directions is a CONFIDENT Flexible, and a member who answered "it
 * varies" to half of it is not.
 */
export function computeConfidence(
  pattern: FuelPattern,
  leadShare: number,
  zeroWeightShare: number
): FpaConfidence {
  if (pattern === 'flexible_fuel') {
    const { high, moderate } = CONFIDENCE_THRESHOLDS.flexible;
    if (zeroWeightShare <= high.maxZeroShare && leadShare <= high.maxLead) return 'high';
    if (zeroWeightShare <= moderate.maxZeroShare) return 'moderate';
    return 'low';
  }

  const { high, moderate } = CONFIDENCE_THRESHOLDS.directional;
  if (leadShare >= high.minLead && zeroWeightShare <= high.maxZeroShare) return 'high';
  if (leadShare >= moderate.minLead && zeroWeightShare <= moderate.maxZeroShare) return 'moderate';
  return 'low';
}
