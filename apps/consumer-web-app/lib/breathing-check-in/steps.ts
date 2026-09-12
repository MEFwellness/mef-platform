/**
 * The walk: which screen she is on, and where she picks up.
 *
 * ONE QUESTION PER SCREEN, THREE PAUSES, ONE COMPLETION. The order is
 * fixed and comes from two places and no others: the instrument's own item
 * order (./instrument.ts) and the three milestone positions
 * (./copy.ts BPC_MILESTONES). Nothing here decides content.
 *
 * WHERE SHE PICKS UP IS DERIVED, NEVER A STORED INDEX ALONE. The first
 * question she has not answered is a fact about her answers; a stored
 * index is a fact about a screen she was on when a save landed. The second
 * can be stale, so it is written (a coach's own diagnostics read it) and
 * never trusted on its own.
 *
 * A PAUSE IS NEVER WHERE SHE RESUMES. Coming back from her mail app onto
 * an encouragement screen, with no question in front of her, reads as
 * having lost her place. Resume always lands on a question, or on the
 * completion screen when all sixteen are answered.
 */

import { BPC_ITEMS, bpcOption, type BpcAnswers, type BpcItem } from './instrument';
import { BPC_MILESTONES, type BpcMilestone } from './copy';

export type BpcStep =
  | {
      kind: 'question';
      item: BpcItem;
      /** 1 to 16. What "Question 6 of 16" prints, and the progress line's numerator. */
      questionNumber: number;
      questionCount: number;
    }
  | { kind: 'milestone'; milestone: BpcMilestone; questionsDone: number; questionCount: number }
  | { kind: 'completion' };

/**
 * Every screen, in order.
 *
 * A milestone whose afterPosition is not a real question position is
 * dropped rather than placed at the end, so a mistyped edit removes one
 * pause instead of appending an orphan screen after the last question.
 */
export function buildBpcSteps(): BpcStep[] {
  const questionCount = BPC_ITEMS.length;
  const pauses = new Map<number, BpcMilestone>();
  for (const milestone of BPC_MILESTONES) {
    if (milestone.afterPosition >= 1 && milestone.afterPosition < questionCount) {
      pauses.set(milestone.afterPosition, milestone);
    }
  }

  const steps: BpcStep[] = [];
  BPC_ITEMS.forEach((item, index) => {
    const questionNumber = index + 1;
    steps.push({ kind: 'question', item, questionNumber, questionCount });
    const milestone = pauses.get(questionNumber);
    if (milestone) {
      steps.push({ kind: 'milestone', milestone, questionsDone: questionNumber, questionCount });
    }
  });
  steps.push({ kind: 'completion' });
  return steps;
}

/** The index of the completion screen, which is also the last legal index. */
export function bpcCompletionIndex(steps: BpcStep[]): number {
  return Math.max(0, steps.length - 1);
}

/** Anything outside the walk is pulled back into it rather than rendering nothing. */
export function clampBpcStepIndex(steps: BpcStep[], index: unknown): number {
  const asNumber = typeof index === 'number' && Number.isFinite(index) ? Math.floor(index) : 0;
  return Math.max(0, Math.min(asNumber, bpcCompletionIndex(steps)));
}

/**
 * Where reopening puts her.
 *
 * The first question she has not answered. When she has answered all
 * sixteen, the completion screen, because there is nothing left to ask and
 * the only thing outstanding is the submit.
 */
export function resumeBpcStepIndex(steps: BpcStep[], answers: BpcAnswers): number {
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    if (step.kind !== 'question') continue;
    if (!bpcOption(answers[step.item.itemId])) return index;
  }
  return bpcCompletionIndex(steps);
}

/**
 * How full the progress line is, nought to one hundred.
 *
 * IT COUNTS ANSWERED QUESTIONS, NOT SCREENS. A pause is not progress
 * through the instrument, and a line that jumped on an encouragement
 * screen would be claiming she had answered something she had not. On the
 * completion screen it is one hundred by the same rule: all sixteen are
 * answered by the time she reaches it.
 */
export function bpcProgressPercent(answers: BpcAnswers): number {
  const total = BPC_ITEMS.length;
  if (total === 0) return 0;
  const answered = BPC_ITEMS.reduce(
    (count, item) => (bpcOption(answers[item.itemId]) ? count + 1 : count),
    0
  );
  return Math.round((answered / total) * 100);
}
