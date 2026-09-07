/**
 * The Giving Ledger, in one place: what it is called, what it is addressed
 * by, and how long its experiment runs.
 *
 * The database id is FIXED and must match
 * supabase/migrations/00000000000213_the_giving_ledger.sql exactly. It is
 * what the existing assignment machinery addresses this experience by, the
 * same way every other assessment in the catalog is addressed (migration
 * 70) and the same way the two Happiness templates beside it are
 * (migrations 211 and 212). It is never generated at runtime, so local,
 * staging and production all resolve this experience to the same
 * definition.
 */

/** The catalog key. Matches assessment_definitions.key and the stored experience_key. */
export const TGL_KEY = 'the-giving-ledger' as const;

/** assessment_definitions.id. Fixed, and shared with migration 213. */
export const TGL_DEFINITION_ID = 'd4b0f7c3-9a25-4e18-b6d3-8c1f5a2e70b9';

/** The route the pop-up, the Home card and the coach's own link all point at. */
export const TGL_ROUTE = '/the-giving-ledger';

/** lifestyle_experiments.source_experience_key for an experiment this deep-dive started. */
export const TGL_EXPERIENCE_KEY = 'the-giving-ledger' as const;

/** Seven days, matching every other daily experiment this app offers. */
export const TGL_EXPERIMENT_DURATION_DAYS = 7;

/**
 * How long an assignment is given when the coach names no day.
 *
 * The assign button sends it and says nothing about a deadline, so seven
 * days is what the app decides on the coach's behalf, exactly as the two
 * templates beside it decide it. It is read once, in
 * app/actions/theGivingLedger.ts.
 */
export const TGL_DEFAULT_DUE_IN_DAYS = 7;

/**
 * The one table every Happiness deep-dive sitting lives in (migration 211).
 *
 * Re-exported from the first template in the family rather than restated,
 * so three templates can never end up with three names for one table.
 */
export { HAPPINESS_DEEP_DIVE_TABLE } from '../owning-your-value/constants';
