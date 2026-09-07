/**
 * Your Own Company, in one place: what it is called, what it is addressed
 * by, and how long its experiment runs.
 *
 * The database id is FIXED and must match
 * supabase/migrations/00000000000218_your_own_company.sql exactly. It is
 * what the existing assignment machinery addresses this experience by, the
 * same way every other assessment in the catalog is addressed (migration
 * 70) and the same way the six Happiness templates beside it are
 * (migrations 211, 212, 213, 214, 215 and 217). It is never generated at
 * runtime, so local, staging and production all resolve this experience to
 * the same definition.
 */

/** The catalog key. Matches assessment_definitions.key and the stored experience_key. */
export const YOC_KEY = 'your-own-company' as const;

/** assessment_definitions.id. Fixed, and shared with migration 218. */
export const YOC_DEFINITION_ID = 'b7d2ef85-3c61-4a09-8d47-5f2b6e1c94a0';

/** The route the pop-up, the Home card and the coach's own link all point at. */
export const YOC_ROUTE = '/your-own-company';

/** lifestyle_experiments.source_experience_key for an experiment this deep-dive started. */
export const YOC_EXPERIENCE_KEY = 'your-own-company' as const;

/** Seven days, matching every other daily experiment this app offers. */
export const YOC_EXPERIMENT_DURATION_DAYS = 7;

/**
 * How long an assignment is given when the coach names no day.
 *
 * The assign button sends it and says nothing about a deadline, so seven
 * days is what the app decides on the coach's behalf, exactly as the six
 * templates beside it decide it. It is read once, in
 * app/actions/yourOwnCompany.ts.
 */
export const YOC_DEFAULT_DUE_IN_DAYS = 7;

/**
 * The one table every Happiness deep-dive sitting lives in (migration 211).
 *
 * Re-exported from the first template in the family rather than restated,
 * so seven templates can never end up with seven names for one table.
 */
export { HAPPINESS_DEEP_DIVE_TABLE } from '../owning-your-value/constants';
