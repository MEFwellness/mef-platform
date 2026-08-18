/**
 * What she reads after she tells us something.
 *
 * ONE PLACE, because the list view, the walk-through and any screen after
 * them all have to say the same thing, and a sentence typed into three
 * components is three sentences waiting to disagree.
 *
 * WARM, AND NO FAULT ANYWHERE. Nothing here implies she did something
 * wrong, nothing thanks her for "being honest" as though honesty were in
 * question, nothing tells her to push through, and nothing celebrates.
 * Every message says what happened and what happens next.
 *
 * NO EM DASHES and no exclamation marks, per the house rules.
 */
import type { ExerciseFeedbackBranch } from '@mef/shared-types-contracts';

/** The subtle control that opens the sheet. Phrased as an offer, not as a complaint form. */
export const FEEDBACK_TRIGGER_LABEL = 'Need another option?';

export const FEEDBACK_SHEET_TITLE = 'What is not working?';
export const FEEDBACK_SHEET_BLURB =
  'Tell us what is going on and we will sort it out. There is no wrong answer here.';
export const FEEDBACK_OTHER_PLACEHOLDER = 'Tell us in your own words (optional)';

/**
 * The safety message. She reads this and nothing else: no options, no
 * "try this instead", no suggestion that a different exercise would be
 * fine.
 */
export const PAIN_MESSAGE =
  'Thank you for telling us. We have taken this one out of your session for now, and your coach will take a look. Please skip anything that hurts. Nothing here is worth working through pain for.';

/** Too easy. Warm, and honest that the answer is her coach's rather than the app's. */
export const TOO_EASY_MESSAGE =
  'Good to know, and well done. Your coach will look at your progression and set the next step with you. We will not make it harder on our own.';

/** A locked exercise. Says why, rather than hiding the control. */
export const LOCKED_MESSAGE = 'Your coach chose this one specifically.';

/** Nothing fitted. Still an answer, and still not her problem to solve. */
export const NO_OPTIONS_MESSAGE =
  'There is nothing else that does this job in your session right now, so we have passed it to your coach. Skip it today if you need to.';

export const OPTIONS_HEADING = 'Here is what would work just as well';
export const OPTIONS_BLURB =
  'Pick one and it replaces this exercise for the rest of your program. Or keep the one you have.';
export const KEEP_ORIGINAL_LABEL = 'Keep the one I have';

/** After she picks. `count` is how many future sessions were rewritten. */
export function swapConfirmationMessage(input: {
  replacementName: string;
  occurrencesUpdated: number;
}): string {
  const rest =
    input.occurrencesUpdated > 0
      ? ` It is in place for your next ${input.occurrencesUpdated} ${
          input.occurrencesUpdated === 1 ? 'session' : 'sessions'
        } of this program.`
      : '';
  return `Done. You have ${input.replacementName} instead.${rest} Your coach can see the change.`;
}

/** The one message a branch produces before she has picked anything. */
export function branchMessage(input: {
  branch: ExerciseFeedbackBranch;
  isLocked: boolean;
  optionCount: number;
}): string {
  if (input.isLocked) return LOCKED_MESSAGE;
  if (input.branch === 'safety') return PAIN_MESSAGE;
  if (input.branch === 'progression_note') return TOO_EASY_MESSAGE;
  if (input.optionCount === 0) return NO_OPTIONS_MESSAGE;
  return OPTIONS_BLURB;
}
