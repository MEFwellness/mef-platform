/**
 * The MEF Body Systems Survey, in one place: what it is called, what it is
 * addressed by, and how long a coach's assignment is given.
 *
 * The database id is FIXED and must match
 * supabase/migrations/00000000000220_body_systems_survey.sql exactly. It is
 * what the existing assignment machinery addresses this experience by, the
 * same way every other assessment in the catalog is addressed (migration
 * 70). It is never generated at runtime, so local, staging and production
 * all resolve this experience to the same definition.
 */

/** The catalog key. Matches assessment_definitions.key. */
export const BODY_SYSTEMS_KEY = 'body-systems-survey' as const;

/** assessment_definitions.id. Fixed, and shared with migration 220. */
export const BODY_SYSTEMS_DEFINITION_ID = 'c1d8a4f2-97b3-4e56-8a0d-2f7b6c3e91a4';

/** The route the pop-up, the Home card and the coach's own link all point at. */
export const BODY_SYSTEMS_ROUTE = '/body-systems';

/** registry_entries.source_feature for the eleven rows a completion publishes. */
export const BODY_SYSTEMS_SOURCE_FEATURE = 'body_systems_survey_finding' as const;

/**
 * How long an assignment is given when the coach names no day.
 *
 * Seven days, the same default every other coach assigned experience in
 * this app carries, so "overdue" means one thing across the whole ledger.
 */
export const BODY_SYSTEMS_DEFAULT_DUE_IN_DAYS = 7;

/**
 * The generation of stored content a sitting is filed against.
 *
 * Bumped by hand when the shape of the content changes in a way that makes
 * old answers unreadable as answers to the questions actually asked. A
 * reworded prompt does NOT bump it: the revision trail
 * (body_systems_content_revisions) is what answers "was this reworded
 * partway through".
 */
export const BODY_SYSTEMS_CONTENT_VERSION = 1;

/**
 * The name and the area, in code rather than in the copy table.
 *
 * These two are read synchronously by the assignable catalog, the shared
 * assignment name map and the coach's status block, all of which are pure
 * functions with no database of their own. Every word the SURVEY ITSELF
 * says is a row in body_systems_copy; these two are how the rest of the
 * app addresses the thing, exactly as STRESS_LOAD_LABEL is.
 */
export const BODY_SYSTEMS_LABEL = 'MEF Body Systems Survey';
export const BODY_SYSTEMS_AREA = 'Whole body';
