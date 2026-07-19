/**
 * Primal Pattern Assessment — scoring. Pure functions, no Supabase, no
 * questionnaire-specific literals beyond what's passed in — same
 * "generic engine over plain data" discipline as
 * lib/assessments/engine/scoring.ts.
 *
 * Rules (exact, per the source score sheet):
 *   A exceeds B by 3 or more  -> Polar
 *   Tie or within 2           -> Variable
 *   B exceeds A by 3 or more  -> Equatorial
 *
 * A both-answer selection (member circled both A and B) counts toward
 * BOTH totals, exactly as "add the number of questions you circled A and
 * the number you circled B" implies when a question has both circled. A
 * skipped question (no letters recorded) contributes to neither count.
 */

import type {
  PrimalPatternAnswers,
  PrimalPatternQuestionnaire,
  PrimalPatternResult,
  PrimalPatternScore,
} from './types';

export function classifyPrimalPatternResult(aCount: number, bCount: number): PrimalPatternResult {
  const diff = aCount - bCount;
  if (diff >= 3) return 'polar';
  if (diff <= -3) return 'equatorial';
  return 'variable';
}

export function scorePrimalPattern(
  questionnaire: PrimalPatternQuestionnaire,
  answers: PrimalPatternAnswers
): PrimalPatternScore {
  let aCount = 0;
  let bCount = 0;
  let bothCount = 0;
  let answeredCount = 0;

  for (const question of questionnaire.questions) {
    const letters = answers[question.number];
    if (!letters || letters.length === 0) continue;

    answeredCount += 1;
    if (letters.includes('A')) aCount += 1;
    if (letters.includes('B')) bCount += 1;
    if (letters.length === 2) bothCount += 1;
  }

  const skippedCount = questionnaire.questions.length - answeredCount;

  return {
    aCount,
    bCount,
    bothCount,
    skippedCount,
    result: classifyPrimalPatternResult(aCount, bCount),
  };
}

export function totalAnsweredCount(
  questionnaire: PrimalPatternQuestionnaire,
  answers: PrimalPatternAnswers
): number {
  return questionnaire.questions.filter((q) => (answers[q.number]?.length ?? 0) > 0).length;
}
