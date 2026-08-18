/**
 * THE SIX THINGS THAT CAN HAPPEN AT THE END OF A PHASE.
 *
 * One list, named once, so the recommendation engine, the review screen,
 * the server action and the database check constraint are all talking about
 * the same six words. The vocabulary is the locked period-end decision and
 * nothing may be added to it here: a seventh outcome is a product decision,
 * not a code change.
 *
 * EVERY OUTCOME PRODUCES A DRAFT, and none of them publishes. That is the
 * one invariant this whole feature rests on, so it is stated as data
 * (`publishes: false` on every row) and asserted by a test rather than left
 * as a promise in a comment.
 *
 * NO EM DASHES, per the house rule.
 */

export type ReviewOutcome =
  | 'progress_next_phase'
  | 'rotate_exercises'
  | 'repeat_phase'
  | 'recovery_week'
  | 'different_program'
  | 'complete_and_archive';

export interface ReviewOutcomeSpec {
  key: ReviewOutcome;
  /** The button. Short, in the coach's own words. */
  label: string;
  /** The line under it. What will actually happen if she taps it. */
  description: string;
  /** What the confirm step asks. One sentence, and it always says "draft" where a draft is produced. */
  confirm: string;
  /**
   * True when the outcome writes an unpublished assignment the coach then
   * approves. False for the two that do not build a program: handing off to
   * the assign flow, and closing the program out.
   */
  producesProgramDraft: boolean;
  /** Never true. Present so the invariant is data a test can read. */
  publishes: false;
}

export const REVIEW_OUTCOMES: readonly ReviewOutcomeSpec[] = [
  {
    key: 'progress_next_phase',
    label: 'Progress to next phase',
    description:
      'Builds the next four weeks from this program, with a suggested weight on every exercise she has logged one for. You edit the numbers before anything reaches her.',
    confirm:
      'This writes a draft of her next phase. Nothing goes to her until you approve it.',
    producesProgramDraft: true,
    publishes: false,
  },
  {
    key: 'rotate_exercises',
    label: 'Rotate exercises',
    description:
      'Same goals, same blocks, fresh movements. Every exercise that is not locked is replaced by one the slot will accept, and anything on her avoidance list is left out.',
    confirm:
      'This writes a draft with different movements in the same shape. Nothing goes to her until you approve it.',
    producesProgramDraft: true,
    publishes: false,
  },
  {
    key: 'repeat_phase',
    label: 'Repeat the phase',
    description:
      'The same program again, from a fresh start date. Useful when she missed too much of it for the last four weeks to be a fair read.',
    confirm:
      'This writes a draft of the same program again. Nothing goes to her until you approve it.',
    producesProgramDraft: true,
    publishes: false,
  },
  {
    key: 'recovery_week',
    label: 'Schedule a recovery week',
    description:
      'One week built from the Root recovery session she already has. Gentle, short, and nothing loaded.',
    confirm:
      'This writes a draft of a one week recovery block. Nothing goes to her until you approve it.',
    producesProgramDraft: true,
    publishes: false,
  },
  {
    key: 'different_program',
    label: 'Assign a different program',
    description:
      'Opens the assign flow so you can pick a named program or build one. The draft is made there, the same way it always is.',
    confirm: 'This takes you to the assign flow. Nothing is written here.',
    producesProgramDraft: false,
    publishes: false,
  },
  {
    key: 'complete_and_archive',
    label: 'Complete and archive',
    description:
      'Closes this program out with no follow-on. Her history keeps everything she did.',
    confirm:
      'This closes the program and writes no new program. She keeps her whole history.',
    producesProgramDraft: false,
    publishes: false,
  },
];

export const REVIEW_OUTCOME_KEYS: readonly ReviewOutcome[] = REVIEW_OUTCOMES.map((o) => o.key);

export function isReviewOutcome(value: unknown): value is ReviewOutcome {
  return typeof value === 'string' && REVIEW_OUTCOME_KEYS.includes(value as ReviewOutcome);
}

export function reviewOutcomeSpec(key: ReviewOutcome): ReviewOutcomeSpec {
  return REVIEW_OUTCOMES.find((o) => o.key === key)!;
}

export function reviewOutcomeLabel(key: ReviewOutcome): string {
  return reviewOutcomeSpec(key).label;
}
