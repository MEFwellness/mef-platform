/**
 * The Weight of Yes, in one place: what it is called, what it is addressed
 * by, and how long its experiment runs.
 *
 * The database id is FIXED and must match
 * supabase/migrations/00000000000214_the_weight_of_yes.sql exactly. It is
 * what the existing assignment machinery addresses this experience by, the
 * same way every other assessment in the catalog is addressed (migration
 * 70) and the same way the three Happiness templates beside it are
 * (migrations 211, 212 and 213). It is never generated at runtime, so
 * local, staging and production all resolve this experience to the same
 * definition.
 */

/** The catalog key. Matches assessment_definitions.key and the stored experience_key. */
export const TWOY_KEY = 'the-weight-of-yes' as const;

/** assessment_definitions.id. Fixed, and shared with migration 214. */
export const TWOY_DEFINITION_ID = 'e2a8d16b-5c34-4f79-a0e5-3b7c9d248f16';

/** The route the pop-up, the Home card and the coach's own link all point at. */
export const TWOY_ROUTE = '/the-weight-of-yes';

/** lifestyle_experiments.source_experience_key for an experiment this deep-dive started. */
export const TWOY_EXPERIENCE_KEY = 'the-weight-of-yes' as const;

/** Seven days, matching every other daily experiment this app offers. */
export const TWOY_EXPERIMENT_DURATION_DAYS = 7;

/**
 * How long an assignment is given when the coach names no day.
 *
 * The assign button sends it and says nothing about a deadline, so seven
 * days is what the app decides on the coach's behalf, exactly as the three
 * templates beside it decide it. It is read once, in
 * app/actions/theWeightOfYes.ts.
 */
export const TWOY_DEFAULT_DUE_IN_DAYS = 7;

/**
 * The one table every Happiness deep-dive sitting lives in (migration 211).
 *
 * Re-exported from the first template in the family rather than restated,
 * so four templates can never end up with four names for one table.
 */
export { HAPPINESS_DEEP_DIVE_TABLE } from '../owning-your-value/constants';
