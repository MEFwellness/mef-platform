/**
 * Every sentence the member reads in the Health Appraisal that is not a
 * question, in one place.
 *
 * APPROVED WORDING IS QUOTED EXACTLY. The framing, the four answer
 * definitions, the body map instruction and the completion line were
 * approved word for word, and tests/haq-member-experience.test.tsx holds a
 * second copy of each so a reworded constant fails instead of shipping.
 *
 * No em dashes, no numbers, no scores, no colours that mean good or bad.
 */

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
