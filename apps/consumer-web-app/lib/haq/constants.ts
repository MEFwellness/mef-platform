/**
 * The Rooted Reset Health Appraisal Questionnaire, in one place: what it is
 * called, what it is addressed by, and how long a coach's assignment is
 * given.
 *
 * NO WORDS AND NO NUMBERS FROM THE INSTRUMENT. This file is imported by the
 * coach's assignable list, the shared assignment name map and the member's
 * shelf, none of which should pull the 260 questions into their bundle. The
 * questions live in ./questionBank.ts, which re-exports the identity below
 * so there is still one source for each of these values.
 *
 * THE CATALOG ID IS FIXED and must match
 * supabase/migrations/00000000000263_rooted_reset_haq_registration.sql
 * exactly, the same convention as migrations 70, 231 and 236.
 */

/** unified_assessment_definitions.key and assessment_definitions.key. */
export const HAQ_KEY = 'haq';
export const HAQ_VERSION = 'haq_v1';
export const HAQ_VERSION_NUMBER = 1;
export const HAQ_TITLE = 'Rooted Reset Health Appraisal Questionnaire';
export const HAQ_QUESTION_COUNT = 260;
export const HAQ_SECTION_COUNT = 21;

/** assessment_definitions.id. Fixed, and shared with migration 263. */
export const HAQ_DEFINITION_ID = '62aaba8a-9cbd-4a8b-998c-101c3f665e69';

/** The member facing name. The same string as the instrument's title, so there is one name per thing. */
export const HAQ_LABEL = HAQ_TITLE;

/** Where space is tight: the completion heading, a compact label. */
export const HAQ_SHORT_LABEL = 'Health Appraisal';

/** The one route. Intro, questions, body map and completion all live here, as they do for the other coach assigned questionnaires. */
export const HAQ_ROUTE = '/health-appraisal';

/** The area a coach can type to find it in the assignable list. */
export const HAQ_AREA = 'Whole body';

/**
 * What the card and the intro say about time. 260 short tap answers and a
 * body map at a comfortable pace. An estimate, said as one.
 */
export const HAQ_ESTIMATED_MINUTES = 30;

/** Seven days, the default every other coach assigned experience carries, so "overdue" means one thing across the ledger. */
export const HAQ_DEFAULT_DUE_IN_DAYS = 7;

/** The number of parts, which is what "Part X of 10" counts. */
export const HAQ_PART_COUNT = 10;
