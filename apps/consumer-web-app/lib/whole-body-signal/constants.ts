/**
 * The MEF Whole-Body Signal Assessment, in one place: what it is called,
 * what it is addressed by, and how long a coach's assignment is given.
 *
 * IT IS A DIFFERENT INSTRUMENT FROM THE TWO IT SITS BESIDE. The MEF Body
 * Systems Survey (lib/body-systems/) and the legacy Whole-Body Check-In in
 * the assessment registry keep their own ids, their own tables and their
 * own bands. Nothing in this folder reads or writes either of them.
 *
 * The database id is FIXED and must match
 * supabase/migrations/00000000000225_whole_body_signal_assessment.sql
 * exactly. It is never generated at runtime, so local, staging and
 * production all resolve this experience to the same definition.
 */

/** The catalog key. Matches assessment_definitions.key. */
export const WBS_KEY = 'whole-body-signal' as const;

/** assessment_definitions.id. Fixed, and shared with migration 225. */
export const WBS_DEFINITION_ID = '5b9e2c74-3a81-4f6d-9c25-7e48d1b0af36';

/** The route the pop-up, the Home card and the coach's own link all point at. */
export const WBS_ROUTE = '/whole-body-signal';

/**
 * How long an assignment is given when the coach names no day.
 *
 * Seven days, the same default every other coach assigned experience in
 * this app carries, so "overdue" means one thing across the whole ledger.
 */
export const WBS_DEFAULT_DUE_IN_DAYS = 7;

/**
 * The generation of stored content a sitting is filed against.
 *
 * Bumped by hand when the shape of the content changes in a way that makes
 * old answers unreadable as answers to the questions actually asked. A
 * reworded prompt does NOT bump it: whole_body_signal_content_revisions is
 * what answers "was this reworded partway through".
 *
 * 2 (migration 228): four questions moved from the five option frequency
 * scale to Yes / No / Not sure, so an "Often" stored against one of them
 * is no longer an answer to the question that was asked. Nothing rewrites
 * a stored answer: a value that is not on its question's own scale is
 * simply read as unanswered, which is why a sitting that straddled the
 * change cannot score nonsense.
 */
export const WBS_CONTENT_VERSION = 2;

/**
 * The name and the area, in code rather than in the copy table.
 *
 * These two are read synchronously by the assignable catalog, the shared
 * assignment name map and the coach's status block, all of which are pure
 * functions with no database of their own. Every word the ASSESSMENT
 * ITSELF says is a row in whole_body_signal_copy; these two are how the
 * rest of the app addresses the thing.
 */
export const WBS_LABEL = 'MEF Whole-Body Signal Assessment';
export const WBS_AREA = 'Whole body';

/** The literal stored for a Prefer not to answer tap. Scores nothing, leaves every denominator. */
export const PNTA_VALUE = 'pnta' as const;
