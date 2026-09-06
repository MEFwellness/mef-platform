/**
 * Owning Your Value, in one place: what it is called, what it is addressed
 * by, and how long its experiment runs.
 *
 * The database id is FIXED and must match
 * supabase/migrations/00000000000211_owning_your_value.sql exactly. It is
 * what the existing assignment machinery addresses this experience by, the
 * same way every other assessment in the catalog is addressed (migration
 * 70) and the same way the Stress & Load Deep-Dive is (migration 190). It
 * is never generated at runtime, so local, staging and production all
 * resolve this experience to the same definition.
 */

/** The catalog key. Matches assessment_definitions.key and the stored experience_key. */
export const OYV_KEY = 'owning-your-value' as const;

/** assessment_definitions.id. Fixed, and shared with migration 211. */
export const OYV_DEFINITION_ID = 'c1d7a4f2-8b36-4e09-a5c7-2f9d63b48e15';

/** The route the pop-up, the Home card and the coach's own link all point at. */
export const OYV_ROUTE = '/owning-your-value';

/** lifestyle_experiments.source_experience_key for an experiment this deep-dive started. */
export const OYV_EXPERIENCE_KEY = 'owning-your-value' as const;

/** Seven days, matching every other daily experiment this app offers. */
export const OYV_EXPERIMENT_DURATION_DAYS = 7;

/**
 * How long an assignment is given when the coach names no day.
 *
 * The assign button sends it and says nothing about a deadline, so seven
 * days is what the app decides on the coach's behalf, exactly as the Stress
 * & Load Deep-Dive's own default does. It is read once, in
 * app/actions/owningYourValue.ts.
 */
export const OYV_DEFAULT_DUE_IN_DAYS = 7;

/** The one table every Happiness deep-dive sitting lives in (migration 211). */
export const HAPPINESS_DEEP_DIVE_TABLE = 'member_happiness_deep_dive_sessions' as const;
