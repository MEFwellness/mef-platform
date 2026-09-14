/**
 * Rooted Reset Fuel Pattern Assessment — what the COACH reads, assembled
 * once.
 *
 * THE COACH SEES WHAT SHE NEVER DOES, and that is the whole point of this
 * file: the final pattern with its confidence, all three raw scores, her
 * response tendencies in plain language, every place she answered "it
 * varies", the digestive discomfort signal and her vitality answer
 * exactly as she gave it.
 *
 * IT IS A READING, NOT A DIAGNOSIS. Nothing here interprets a symptom,
 * names a condition or turns the discomfort flag into a finding: the flag
 * is printed with the sentence that says it was never scored, and the
 * vitality answer is printed with no interpretation at all.
 *
 * BUILT FROM THE STORED ROW. Every field is read off the row written when
 * she finished, so a coach and the member are looking at one sitting
 * rather than at two recomputations of it.
 */

import { FPA_QUESTIONS, fpaOption } from './questionContent';
import { FPA_VITALITY_QUESTION_KEY } from './constants';
import { FUEL_PATTERN_LABEL } from './copy';
import {
  FPA_CONFIDENCE_LABEL,
  FPA_DIGESTIVE_DISCOMFORT_NOTE,
  FPA_TENDENCY_LABEL,
  FPA_VITALITY_LABEL,
  FPA_VITALITY_NOT_ANSWERED,
} from './coachCopy';
import type { FpaConfidence, FuelPattern } from './types';

export type FpaAmbiguousAnswer = {
  questionKey: string;
  /** 1 to 24, so a coach can find the question in the instrument. */
  order: number;
  prompt: string;
  /** Her answer, in the option's own words. */
  answer: string;
  /**
   * 'varies' is an answer that named no direction ("It varies", "I am not
   * sure"). 'tendency' is an answer that described something real which
   * simply is not one of the three directions (skips breakfast, appetite
   * drops under stress). Both carry zero weight and both are listed,
   * because both are places the instrument did not get a reading.
   */
  kind: 'varies' | 'tendency';
};

export type FpaCoachReading = {
  pattern: FuelPattern;
  patternLabel: string;
  confidence: FpaConfidence;
  confidenceLabel: string;
  scores: { protein: number; balanced: number; carb: number };
  /** How many questions actually scored, so the counts below name their own denominator. */
  scoredQuestionCount: number;
  zeroWeightCount: number;
  /** Her response tendencies, in plain language, in question order. */
  tendencyLines: string[];
  /** Every zero weight answer, in question order. */
  ambiguous: FpaAmbiguousAnswer[];
  digestiveDiscomfort: boolean;
  /** The sentence printed beside the flag. Says plainly that it did not move the pattern. */
  digestiveDiscomfortNote: string;
  /** Her vitality answer in words, "Preferred not to answer", or "Not answered". */
  vitalityLine: string;
};

export type FpaCoachSource = {
  pattern: FuelPattern;
  confidence: FpaConfidence;
  scores: { protein: number; balanced: number; carb: number };
  scoredQuestionCount: number;
  zeroWeightCount: number;
  responses: Record<string, string>;
  tendencies: string[];
  digestiveDiscomfort: boolean;
  vitalityResponse: string | null;
};

export function buildFpaCoachReading(row: FpaCoachSource): FpaCoachReading {
  const ambiguous: FpaAmbiguousAnswer[] = [];

  for (const question of FPA_QUESTIONS) {
    if (question.key === FPA_VITALITY_QUESTION_KEY) continue;
    const value = row.responses[question.key];
    if (typeof value !== 'string' || value === '') continue;
    const option = fpaOption(question.key, value);
    if (!option) continue;
    if (option.weight !== 'neutral' && option.weight !== 'tendency') continue;
    ambiguous.push({
      questionKey: question.key,
      order: question.order,
      prompt: question.prompt,
      answer: option.label,
      kind: option.weight === 'tendency' ? 'tendency' : 'varies',
    });
  }

  return {
    pattern: row.pattern,
    patternLabel: FUEL_PATTERN_LABEL[row.pattern],
    confidence: row.confidence,
    confidenceLabel: FPA_CONFIDENCE_LABEL[row.confidence],
    scores: row.scores,
    scoredQuestionCount: row.scoredQuestionCount,
    zeroWeightCount: row.zeroWeightCount,
    // An unknown code prints its own code rather than disappearing, so a
    // tendency added to the content and not to the label map is visible
    // instead of silently missing.
    tendencyLines: row.tendencies.map((code) => FPA_TENDENCY_LABEL[code] ?? code),
    ambiguous,
    digestiveDiscomfort: row.digestiveDiscomfort,
    digestiveDiscomfortNote: FPA_DIGESTIVE_DISCOMFORT_NOTE,
    vitalityLine: vitalityLineFor(row.vitalityResponse),
  };
}

/**
 * Her Question 23 answer exactly as she gave it. Three states and they
 * are genuinely different: she answered, she explicitly declined, or she
 * was never asked. "Prefer not to answer" is one of the question's own
 * options, so it arrives here as a stored value like any other.
 */
export function vitalityLineFor(vitalityResponse: string | null): string {
  if (!vitalityResponse) return FPA_VITALITY_NOT_ANSWERED;
  return FPA_VITALITY_LABEL[vitalityResponse] ?? vitalityResponse;
}
