/**
 * The Life You're Building, in one place: what it is called, what it is
 * addressed by, and how long its experiment runs.
 *
 * The database id is FIXED and must match
 * supabase/migrations/00000000000219_the_life_youre_building.sql exactly.
 * It is what the existing assignment machinery addresses this experience
 * by, the same way every other assessment in the catalog is addressed
 * (migration 70) and the same way the seven Happiness templates beside it
 * are (migrations 211, 212, 213, 214, 215, 217 and 218). It is never
 * generated at runtime, so local, staging and production all resolve this
 * experience to the same definition.
 */

/** The catalog key. Matches assessment_definitions.key and the stored experience_key. */
export const TLYB_KEY = 'the-life-youre-building' as const;

/** assessment_definitions.id. Fixed, and shared with migration 219. */
export const TLYB_DEFINITION_ID = 'c9f4a1d7-8e52-4b36-a7c1-4d9b2e650f83';

/** The route the pop-up, the Home card and the coach's own link all point at. */
export const TLYB_ROUTE = '/the-life-youre-building';

/** lifestyle_experiments.source_experience_key for an experiment this deep-dive started. */
export const TLYB_EXPERIENCE_KEY = 'the-life-youre-building' as const;

/** Seven days, matching every other daily experiment this app offers. */
export const TLYB_EXPERIMENT_DURATION_DAYS = 7;

/**
 * How long an assignment is given when the coach names no day.
 *
 * The assign button sends it and says nothing about a deadline, so seven
 * days is what the app decides on the coach's behalf, exactly as the seven
 * templates beside it decide it. It is read once, in
 * app/actions/theLifeYoureBuilding.ts.
 */
export const TLYB_DEFAULT_DUE_IN_DAYS = 7;

/**
 * The one table every Happiness deep-dive sitting lives in (migration 211).
 *
 * Re-exported from the first template in the family rather than restated,
 * so eight templates can never end up with eight names for one table.
 */
export { HAPPINESS_DEEP_DIVE_TABLE } from '../owning-your-value/constants';
