/**
 * =====================================================================
 * LAYER 2, COACH SIDE. Turning a stored sitting into what a coach reads.
 * =====================================================================
 *
 * COACH ONLY. It imports ./coachCopy.ts, which is the module no member
 * surface may reach, so this file is inside the fence too.
 *
 * IT READS A STORED RESULT AND NEVER RESCORES ONE. The total, the maximum
 * and every per item point come from the row. Nothing here adds, weights
 * or drops anything, so a coach and a member are always reading two
 * presentations of ONE stored number.
 *
 * THE HIGHEST-RESPONSE LIST IS A SORT, NOT A FINDING. It is her own
 * answers ordered by the points they carry, and it claims nothing about
 * order of onset, severity or cause. The sentence printed beside it says
 * so in words (BPC_COACH_COPY.highestNote).
 */

import {
  BPC_ITEMS,
  bpcItem,
  bpcOption,
  type BpcAnswers,
  type BpcResults,
} from './instrument';
import { BPC_COACHING_QUESTIONS, BPC_COACH_COPY } from './coachCopy';
import { BPC_STRONGEST_MIN_POINTS, bpcAtOrAboveReferenceThreshold } from './signals';

/** One of the sixteen, as the coach's table prints it. */
export type BpcCoachResponseRow = {
  itemId: string;
  position: number;
  /** The validated stimulus, verbatim. */
  prompt: string;
  /** What she picked, or null when she did not answer it. */
  responseLabel: string | null;
  /** Her points for it, or null when unanswered. Coach only. */
  score: number | null;
};

/** All sixteen, in the instrument's own order, answered or not. */
export function bpcCoachResponses(answers: BpcAnswers, results: BpcResults): BpcCoachResponseRow[] {
  return BPC_ITEMS.map((item) => {
    const option = bpcOption(answers[item.itemId]);
    return {
      itemId: item.itemId,
      position: item.position,
      prompt: item.prompt,
      responseLabel: option ? option.label : null,
      score: option ? (results.itemScores[item.itemId] ?? option.points) : null,
    };
  });
}

/** One row of the highest-response list. */
export type BpcHighestResponse = {
  itemId: string;
  prompt: string;
  responseLabel: string;
  score: number;
};

/**
 * How high a response has to be before it earns a line in the
 * highest-response list.
 *
 * THREE, WHICH IS "Often" AND ABOVE, AND IT IS DEFINED ONCE. The member's
 * own results screen now prints her strongest answers too, so this cut off
 * and hers have to be the same number or the two screens would disagree
 * about what stood out in one sitting. It lives in ./signals.ts, which the
 * member layer can import and this file can too (the fence is one way:
 * member surfaces may not reach HERE). Re-exported under its old name so
 * nothing that already reads it has to move.
 */
export const BPC_HIGHEST_RESPONSE_MIN_SCORE = BPC_STRONGEST_MIN_POINTS;

/**
 * The symptoms she answered highest, strongest first.
 *
 * TIES KEEP THE INSTRUMENT'S OWN ORDER, so the list is stable across two
 * renders of one sitting rather than reshuffling on every read.
 */
export function bpcHighestResponses(
  answers: BpcAnswers,
  results: BpcResults
): BpcHighestResponse[] {
  return bpcCoachResponses(answers, results)
    .filter(
      (row): row is BpcCoachResponseRow & { responseLabel: string; score: number } =>
        row.responseLabel !== null &&
        row.score !== null &&
        row.score >= BPC_HIGHEST_RESPONSE_MIN_SCORE
    )
    .sort((a, b) => (b.score === a.score ? a.position - b.position : b.score - a.score))
    .map((row) => ({
      itemId: row.itemId,
      prompt: row.prompt,
      responseLabel: row.responseLabel,
      score: row.score,
    }));
}

/** Whether a stored total reaches the published reference figure. Coach facing only. */
export function bpcAtOrAboveThreshold(results: BpcResults): boolean {
  return bpcAtOrAboveReferenceThreshold(results.totalScore);
}

/** Everything one sitting's coach card renders, built once on the server. */
export type BpcCoachReading = {
  totalScore: number;
  maxScore: number;
  answeredCount: number;
  itemCount: number;
  /** True only when every one of the sixteen carries an answer. */
  isComplete: boolean;
  atOrAboveThreshold: boolean;
  responses: BpcCoachResponseRow[];
  highest: BpcHighestResponse[];
  coachingQuestions: readonly string[];
};

export function buildBpcCoachReading(
  answers: BpcAnswers,
  results: BpcResults
): BpcCoachReading {
  return {
    totalScore: results.totalScore,
    maxScore: results.maxScore,
    answeredCount: results.answeredCount,
    itemCount: BPC_ITEMS.length,
    isComplete: results.answeredCount === BPC_ITEMS.length,
    atOrAboveThreshold: bpcAtOrAboveThreshold(results),
    responses: bpcCoachResponses(answers, results),
    highest: bpcHighestResponses(answers, results),
    coachingQuestions: BPC_COACHING_QUESTIONS,
  };
}

/** The score as a coach reads it. One place, so two cards cannot print it two ways. */
export function bpcScoreSentence(reading: BpcCoachReading): string {
  return `${BPC_COACH_COPY.totalLabel}: ${reading.totalScore} / ${reading.maxScore}`;
}

/** Named here so a caller never has to know an item id to print a prompt. */
export function bpcPromptFor(itemId: string): string {
  return bpcItem(itemId)?.prompt ?? '';
}
