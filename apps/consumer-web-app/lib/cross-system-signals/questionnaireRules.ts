/**
 * WHEN A BODY SYSTEMS SURVEY ANSWER COUNTS AS AN ACTIVE SIGNAL.
 *
 * EVERY NUMBER IN THE RULE LIVES IN THIS FILE, and nowhere else. The
 * adapter that decides which answers to file, the read that decides which
 * filed answers are current, the Root lookup that decides which answers
 * consult the Association Map and the coach's trace that explains each
 * decision all import these constants, so the four can never disagree about
 * what "active" means.
 *
 * THE RULE, IN PLAIN WORDS.
 *
 *   Often or Almost always (6 points or more on the survey's own scale):
 *     always an active signal.
 *
 *   Sometimes (3 points, up to but not including 6): active only when at
 *   least one of these three support conditions holds, each checked
 *   exactly as written here and nothing else:
 *
 *     1. SECTION. The survey section the question belongs to scored
 *        SECTION_STRONGLY_ELEVATED_MIN_PERCENT or more in that same sitting.
 *     2. ANOTHER SOURCE. Another source (a sentence she wrote, a coach
 *        entry, another assessment) recorded the same canonical signal
 *        within OTHER_SOURCE_WINDOW_DAYS days of the sitting, either side,
 *        and that source's most recent word on it inside the window says it
 *        is present rather than settled.
 *     3. A RELATED SURVEY ASSOCIATION. One of the coach approved Body
 *        Systems associations fired on that same sitting, and this question
 *        is named in a question condition of that association which held.
 *        Those conditions only ever count Often and Almost always answers,
 *        so this is an existing, reviewed rule saying the neighbouring
 *        answers are loud, and never an inference made here.
 *
 *   Rarely or Never (under 3 points): never an active signal.
 *
 *   AND ONLY THE NEWEST SITTING IS CURRENT. An answer from a sitting that a
 *   newer completed sitting has replaced is history, whatever it said.
 *
 * WHY 50 FOR A SECTION, and not the survey's own loudest band. That band
 * starts at 35, and a section answered Sometimes to every question scores
 * 38 (3 of 8 points per question). Reusing the band would make every
 * Sometimes answer of a member who answers Sometimes to everything active,
 * which is exactly the flood this rule exists to prevent. At 50, a section
 * needs a real share of Often and Almost always answers before it can lift
 * a Sometimes, and the member's own bands are left completely alone.
 *
 * WHY 30 DAYS FOR ANOTHER SOURCE. It is Root's own window for "current"
 * (lib/cross-system-root/evidence.ts), so "currently supported by another
 * source" means the same thing here that "current" means on every card.
 * Measured against the sitting rather than against today, so the decision
 * about one answer never flips just because a week passed.
 *
 * NO SCORE IS EVER SHOWN BECAUSE OF ANY OF THIS. The section percentage is
 * read to decide; it is never carried onto a signal label, a Root card or
 * a trace line.
 */

import { CURRENT_WINDOW_DAYS } from '@/lib/cross-system-root/evidence';

/** An answer at or above this many points is always active. Often is 6, Almost always is 8. */
export const ACTIVE_MIN_POINTS = 6;

/** An answer at or above this many points, and below ACTIVE_MIN_POINTS, needs support. Sometimes is 3. */
export const SUPPORTABLE_MIN_POINTS = 3;

/** Support condition 1: the question's own section scored at least this, in the same sitting. */
export const SECTION_STRONGLY_ELEVATED_MIN_PERCENT = 50;

/** Support condition 2: another source's row for the same signal within this many days of the sitting. */
export const OTHER_SOURCE_WINDOW_DAYS = CURRENT_WINDOW_DAYS;

/**
 * Named on every finding a survey sitting writes. Change it whenever a
 * number above changes, so a finding can always say which rule decided it.
 */
export const QUESTIONNAIRE_RULE_REVISION = 'body-systems-signal-rule-1';

/** Every reason an answer is, or is not, an active signal. One per branch of the rule. */
export type QuestionnaireBasis =
  | 'often_or_more'
  | 'sometimes_section_elevated'
  | 'sometimes_related_association'
  | 'sometimes_other_source'
  | 'sometimes_without_support'
  | 'rarely_or_never';

/** The bases that make an answer active. */
export const ACTIVE_BASES: ReadonlySet<QuestionnaireBasis> = new Set([
  'often_or_more',
  'sometimes_section_elevated',
  'sometimes_related_association',
  'sometimes_other_source',
]);
