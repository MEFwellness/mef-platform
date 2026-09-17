/**
 * Every sentence the member reads in the Health Appraisal that is not a
 * question, in one place.
 *
 * APPROVED WORDING IS QUOTED EXACTLY. The framing, the four answer
 * definitions, the body map instruction and the completion line were
 * approved word for word, and tests/haq-member-experience.test.tsx holds a
 * second copy of each so a reworded constant fails instead of shipping.
 *
 * No em dashes, no scores, no totals and no cutoffs. The three result
 * colours appear from Prompt 3 onward, because her results page names them,
 * and each one says only what an AREA is showing from what she reported.
 */

import type { HaqMemberResultLabel, HaqResultColor, HaqTrend } from './types';

/** The approved framing, shown once, before question one. */
export const HAQ_INTRO_FRAMING =
  'Think about how you have felt over the last four months. Choose the response that best describes how often you have experienced each symptom.';

/** The one line that tells her there is nothing to get right. */
export const HAQ_INTRO_REASSURANCE =
  'Simply answer from your own experience. There are no right or wrong answers and nothing to calculate.';

export const HAQ_INTRO_SAVE_LINE = 'Your answers save as you go, so you can stop and come back whenever you like.';

export const HAQ_DEFINITIONS_HEADING = 'What each answer means';

export type HaqAnswerDefinition = { term: string; meaning: string };

/** The four approved definitions, in the order the answers are offered. */
export const HAQ_ANSWER_DEFINITIONS: readonly HaqAnswerDefinition[] = [
  {
    term: 'NEVER OR RARELY',
    meaning: 'You do not normally experience this, or it happens very rarely.',
  },
  {
    term: 'SOMETIMES',
    meaning: 'It comes and goes occasionally.',
  },
  {
    term: 'OFTEN',
    meaning: 'You experience it regularly or several times per week.',
  },
  {
    term: 'VERY OFTEN',
    meaning:
      'You experience it very frequently, approximately four or more times per week, daily, or as part of a regular recurring pattern.',
  },
];

/** The help control's accessible name on every question screen. */
export const HAQ_DEFINITIONS_CONTROL_LABEL = 'What the answers mean';

export const HAQ_BEGIN_LABEL = 'Begin';
export const HAQ_CONTINUE_LABEL = 'Continue';
export const HAQ_BACK_LABEL = 'Back';
export const HAQ_EXIT_LABEL = 'Save and exit';
export const HAQ_BLOCKED_HINT = 'Choose an answer for each question to continue.';
export const HAQ_SAVE_FAILED = "That answer didn't save. Check your connection and tap it again.";

/** The section beat. Real section names, never a count. */
export function haqSectionCompleteHeading(sectionTitle: string): string {
  return `${sectionTitle} complete`;
}

export function haqNextLine(nextTitle: string): string {
  return `Next: ${nextTitle}`;
}

export const HAQ_BODY_MAP_TITLE = 'Body map';

/** The approved instruction, exactly. */
export const HAQ_BODY_MAP_INSTRUCTION =
  'Use the body map to show any areas where you currently experience pain, swelling, discomfort, or noticeable changes in skin color or texture.';

export const HAQ_BODY_MAP_OPTIONAL_LINE = 'This step is optional. If nothing applies, you can finish without marking anything.';

export const HAQ_BODY_MAP_SIDES_HINT = 'Tap an area to mark it. Left and right are your own left and right.';
export const HAQ_BODY_MAP_FRONT_LABEL = 'Front';
export const HAQ_BODY_MAP_BACK_LABEL = 'Back';
export const HAQ_BODY_MAP_LIST_TOGGLE = 'Choose an area from a list';
export const HAQ_BODY_MAP_FIGURE_TOGGLE = 'Show the body map';
export const HAQ_BODY_MAP_CHOOSE_CATEGORY = 'What are you noticing here?';
export const HAQ_BODY_MAP_MARKS_HEADING = 'Areas you have marked';
export const HAQ_BODY_MAP_NO_MARKS = 'Nothing marked yet.';
export const HAQ_BODY_MAP_REMOVE_LABEL = 'Remove';
export const HAQ_BODY_MAP_CANCEL_LABEL = 'Cancel';
export const HAQ_BODY_MAP_SAVE_FAILED = "That mark didn't save. Check your connection and try again.";
export const HAQ_FINISH_LABEL = 'Complete';
export const HAQ_FINISH_FAILED = "Something went wrong finishing your Health Appraisal. Please try again.";

/** The approved completion statement, exactly. */
export const HAQ_COMPLETION_STATEMENT = 'Health Appraisal complete. Thank you for taking the time.';
export const HAQ_COMPLETION_COACH_LINE = 'Your coach can now see your responses.';
export const HAQ_COMPLETION_HOME_LABEL = 'Back to Home';

/* ------------------------------------------------------------------ */
/* HER RESULTS                                                         */
/*                                                                     */
/* THE THREE EXPLANATIONS ARE APPROVED WORD FOR WORD and are quoted    */
/* here exactly. tests/haq-member-results.test.tsx holds a second copy */
/* of each, so a reworded constant fails instead of shipping.          */
/*                                                                     */
/* SYMPTOMS, NEVER CONDITIONS. Every sentence on that page says what   */
/* an AREA of the questionnaire is showing, from what she reported.    */
/* Not what her body is, not what she has, and never a diagnosis.      */
/* "Your Thyroid section is showing High Attention" is the shape;      */
/* "your thyroid is bad" is not, and neither is anything like it.      */
/*                                                                     */
/* NO NUMBER BELONGS IN ANY OF IT. No total, no percentage, no         */
/* cutoff, no overall grade and no combined result: those live in      */
/* tables with no member policy at all (migration 262).                */
/* ------------------------------------------------------------------ */

/** The button the completion screen gains, and the way into her results. */
export const HAQ_SEE_RESULTS_LABEL = 'See your results';

/** The results page title, exactly. */
export const HAQ_RESULTS_TITLE = 'HEALTH APPRAISAL RESULTS';

/** The intro line, exactly. */
export const HAQ_RESULTS_INTRO =
  'Your answers help show which areas are currently quieter and which may deserve more attention.';

export const HAQ_RESULTS_SUMMARY_HEADING = 'How your areas read';

/**
 * What each colour means, in her words. Approved exactly, and the only
 * explanation any of the three ever gets.
 */
export const HAQ_RESULT_EXPLANATIONS: Record<HaqResultColor, string> = {
  green: 'This area is currently showing fewer reported concerns.',
  yellow: 'This area is showing enough reported signals to be worth paying attention to.',
  red: 'This area is showing a stronger group of reported concerns and may be worth reviewing more closely with your coach or healthcare professional.',
};

/**
 * The member label each colour carries. The same three words the database
 * stores beside every result (migration 262's check constraint ties them
 * together), repeated here because the summary block names all three whether
 * or not she has a section in that state.
 */
export const HAQ_MEMBER_LABELS: Record<HaqResultColor, HaqMemberResultLabel> = {
  green: 'Doing Well',
  yellow: 'Needs Attention',
  red: 'High Attention',
};

/** "13 areas", and "1 area" when there is one of them. A member never reads "1 areas". */
export function haqAreaCountLabel(count: number): string {
  return count === 1 ? '1 area' : `${count} areas`;
}

/** The one line at the top of the page when she has sat this before. Exactly. */
export const HAQ_RESULTS_COMPARISON_LINE =
  'Compared with your previous Health Appraisal, based on what you reported.';

/**
 * The trend chip, in three words.
 *
 * NEVER A MEDICAL CLAIM. Quieter is not "better" and Louder is not "worse":
 * they say what she reported this time beside what she reported last time,
 * and nothing about her health.
 */
export const HAQ_TREND_LABELS: Record<HaqTrend, string> = {
  quieter: 'Quieter',
  unchanged: 'Unchanged',
  louder: 'Louder',
};

export const HAQ_RESULTS_BACK_LABEL = 'Back to Questionnaires';
