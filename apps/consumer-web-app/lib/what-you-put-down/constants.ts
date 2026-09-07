/**
 * What You Put Down, in one place: what it is called, what it is addressed
 * by, and how long its experiment runs.
 *
 * The database id is FIXED and must match
 * supabase/migrations/00000000000217_what_you_put_down.sql exactly. It is
 * what the existing assignment machinery addresses this experience by, the
 * same way every other assessment in the catalog is addressed (migration
 * 70) and the same way the five Happiness templates beside it are
 * (migrations 211, 212, 213, 214 and 215). It is never generated at
 * runtime, so local, staging and production all resolve this experience to
 * the same definition.
 */

/** The catalog key. Matches assessment_definitions.key and the stored experience_key. */
export const WYPD_KEY = 'what-you-put-down' as const;

/** assessment_definitions.id. Fixed, and shared with migration 217. */
export const WYPD_DEFINITION_ID = 'a8e6d403-2f19-4c57-b8d2-6e4a1f97c503';

/** The route the pop-up, the Home card and the coach's own link all point at. */
export const WYPD_ROUTE = '/what-you-put-down';

/** lifestyle_experiments.source_experience_key for an experiment this deep-dive started. */
export const WYPD_EXPERIENCE_KEY = 'what-you-put-down' as const;

/** Seven days, matching every other daily experiment this app offers. */
export const WYPD_EXPERIMENT_DURATION_DAYS = 7;

/**
 * How long an assignment is given when the coach names no day.
 *
 * The assign button sends it and says nothing about a deadline, so seven
 * days is what the app decides on the coach's behalf, exactly as the five
 * templates beside it decide it. It is read once, in
 * app/actions/whatYouPutDown.ts.
 */
export const WYPD_DEFAULT_DUE_IN_DAYS = 7;

/**
 * The one table every Happiness deep-dive sitting lives in (migration 211).
 *
 * Re-exported from the first template in the family rather than restated,
 * so six templates can never end up with six names for one table.
 */
export { HAPPINESS_DEEP_DIVE_TABLE } from '../owning-your-value/constants';
