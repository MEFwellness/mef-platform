/**
 * Where Your Joy Lives, in one place: what it is called, what it is
 * addressed by, and how long its experiment runs.
 *
 * The database id is FIXED and must match
 * supabase/migrations/00000000000212_where_your_joy_lives.sql exactly. It
 * is what the existing assignment machinery addresses this experience by,
 * the same way every other assessment in the catalog is addressed
 * (migration 70) and the same way Owning Your Value is (migration 211). It
 * is never generated at runtime, so local, staging and production all
 * resolve this experience to the same definition.
 */

/** The catalog key. Matches assessment_definitions.key and the stored experience_key. */
export const WYJL_KEY = 'where-your-joy-lives' as const;

/** assessment_definitions.id. Fixed, and shared with migration 212. */
export const WYJL_DEFINITION_ID = 'b3e9c85a-47d1-4f26-9c0b-1a5e8d37f402';

/** The route the pop-up, the Home card and the coach's own link all point at. */
export const WYJL_ROUTE = '/where-your-joy-lives';

/** lifestyle_experiments.source_experience_key for an experiment this deep-dive started. */
export const WYJL_EXPERIENCE_KEY = 'where-your-joy-lives' as const;

/** Seven days, matching every other daily experiment this app offers. */
export const WYJL_EXPERIMENT_DURATION_DAYS = 7;

/**
 * How long an assignment is given when the coach names no day.
 *
 * The assign button sends it and says nothing about a deadline, so seven
 * days is what the app decides on the coach's behalf, exactly as Owning
 * Your Value's own default does. It is read once, in
 * app/actions/whereYourJoyLives.ts.
 */
export const WYJL_DEFAULT_DUE_IN_DAYS = 7;

/**
 * The one table every Happiness deep-dive sitting lives in (migration 211).
 *
 * Re-exported from the template beside this one rather than restated, so
 * the family can never end up with two names for one table.
 */
export { HAPPINESS_DEEP_DIVE_TABLE } from '../owning-your-value/constants';
