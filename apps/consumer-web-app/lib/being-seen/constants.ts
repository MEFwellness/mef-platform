/**
 * Being Seen, in one place: what it is called, what it is addressed by, and
 * how long its experiment runs.
 *
 * The database id is FIXED and must match
 * supabase/migrations/00000000000215_being_seen.sql exactly. It is what the
 * existing assignment machinery addresses this experience by, the same way
 * every other assessment in the catalog is addressed (migration 70) and the
 * same way the four Happiness templates beside it are (migrations 211, 212,
 * 213 and 214). It is never generated at runtime, so local, staging and
 * production all resolve this experience to the same definition.
 */

/** The catalog key. Matches assessment_definitions.key and the stored experience_key. */
export const BSN_KEY = 'being-seen' as const;

/** assessment_definitions.id. Fixed, and shared with migration 215. */
export const BSN_DEFINITION_ID = 'f5c3b921-6d47-4a8e-9b12-7e0a4c85d3f6';

/** The route the pop-up, the Home card and the coach's own link all point at. */
export const BSN_ROUTE = '/being-seen';

/** lifestyle_experiments.source_experience_key for an experiment this deep-dive started. */
export const BSN_EXPERIENCE_KEY = 'being-seen' as const;

/** Seven days, matching every other daily experiment this app offers. */
export const BSN_EXPERIMENT_DURATION_DAYS = 7;

/**
 * How long an assignment is given when the coach names no day.
 *
 * The assign button sends it and says nothing about a deadline, so seven
 * days is what the app decides on the coach's behalf, exactly as the four
 * templates beside it decide it. It is read once, in
 * app/actions/beingSeen.ts.
 */
export const BSN_DEFAULT_DUE_IN_DAYS = 7;

/**
 * The one table every Happiness deep-dive sitting lives in (migration 211).
 *
 * Re-exported from the first template in the family rather than restated,
 * so five templates can never end up with five names for one table.
 */
export { HAPPINESS_DEEP_DIVE_TABLE } from '../owning-your-value/constants';
