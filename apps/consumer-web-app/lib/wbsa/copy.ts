/**
 * WBSA member-facing copy — deterministic, hand-authored, no LLM
 * involvement (same discipline as lib/assessments/insights.ts). Wellness-
 * education language only: never a diagnosis, never a disease claim,
 * never medical advice, no AI mentioned, no em dashes.
 */

export const WBSA_DISPLAY_TITLE = 'Whole-Body Check-In';

export const WBSA_INTRO_COPY = {
  heading: 'A whole-body check-in',
  body: [
    'This walks through 16 short areas of everyday life, from how meals sit with you and how your energy holds up, to sleep, aches, mood and recovery.',
    'It helps gather whole-body context by asking about patterns you already notice day to day: how often something shows up, how long it lasts, and what seems to trigger it.',
    'It does not diagnose any medical condition. It is a wellness-education tool meant to help you and your coach decide what is worth exploring further.',
  ],
  structureNote:
    'It is organized into 16 short sections, one area at a time. Most people finish in about 20 minutes, and you can save and come back whenever you need to.',
};

export const WBSA_SAFETY_STATEMENT =
  'This assessment is a wellness-education tool. It does not diagnose a medical condition, replace a lab test or clinical exam, or tell you to change any medication. If you have symptoms that feel urgent, persistent, or concerning, please talk with a qualified healthcare professional.';

export const WBSA_RED_FLAG_MEMBER_MESSAGE = {
  title: 'One of your answers deserves prompt attention',
  body: 'Based on something you shared, we recommend checking in with a qualified healthcare professional soon. Your coach has also been notified so they can follow up with you.',
};

export const WBSA_COMPLETION_COPY = {
  heading: 'Assessment complete',
  body: 'Thank you for taking the time to walk through this with us. Your Whole-Body Check-In has been saved.',
};

export const WBSA_PREFER_NOT_TO_ANSWER_LABEL = 'Prefer not to answer';

/** Result-screen band labels — calm, non-diagnostic, per the WBSA content brief. Distinct from the shared PriorityBadge's "Low/Moderate/High priority" copy, which stays unchanged for every other assessment. */
export const WBSA_BAND_LABEL = {
  lower: 'Lower Reported Pattern',
  watch: 'Worth Watching',
  needs_context: 'Needs More Context',
} as const;

export const WBSA_BAND_DESCRIPTION = {
  lower: 'You reported very little in this area right now.',
  watch: 'You reported a moderate amount here, worth keeping an eye on.',
  needs_context:
    'You reported more here than in most areas. This does not identify a medical condition, and it does help show what is worth exploring next.',
} as const;

export const WBSA_RESULT_INTRO =
  'These results reflect what you reported, grouped the same way the questions were. Consider discussing anything persistent or concerning with a qualified healthcare professional.';

export const WBSA_SKIPPED_QUESTIONS_NOTE =
  "You chose not to answer one or more questions, which is completely fine. Those responses aren't included in the pattern summary below.";
