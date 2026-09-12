/**
 * The Health & Lifestyle Intake, in one place: what it is called, what it
 * is addressed by, and how long a coach's assignment is given.
 *
 * IT IS A SEPARATE INSTRUMENT, and the separation is the whole point of
 * the family it joins. The MEF Body Systems Survey (lib/body-systems/)
 * says which systems are speaking loudly. The MEF Whole-Body Signal
 * Assessment (lib/whole-body-signal/) reads the same body a different way.
 * The Stress & Load Deep-Dive (lib/stress-load/) goes deeper on one
 * subject when a coach decides it is warranted. This one establishes the
 * CONTEXT behind all of them: history, what she is here for, what she is
 * treated for and takes, what has happened to her body, what she has
 * already tried, her stress, her rhythm and what she has been
 * experiencing.
 *
 * Nothing in this folder reads, writes, renames or retires any of them.
 * It scores nothing, it bands nothing and it produces no reading, because
 * an intake is not a measurement.
 *
 * The database id is FIXED and must match
 * supabase/migrations/00000000000230_health_lifestyle_intake.sql exactly,
 * so local, staging and production all resolve this experience to the same
 * definition. Same convention as migrations 70, 190, 211 through 220 and
 * 225.
 */

/** The catalog key. Matches assessment_definitions.key. */
export const HLI_KEY = 'health-lifestyle-intake' as const;

/** assessment_definitions.id. Fixed, and shared with migration 230. */
export const HLI_DEFINITION_ID = '7d4c1a58-2b93-4e07-9f61-3a8e5c2d0b74';

/** The route the pop-up, the Home card and the coach's own link all point at. */
export const HLI_ROUTE = '/health-intake';

/**
 * How long an assignment is given when the coach names no day.
 *
 * Seven days, the same default every other coach assigned experience in
 * this app carries, so "overdue" means one thing across the whole ledger.
 */
export const HLI_DEFAULT_DUE_IN_DAYS = 7;

/**
 * The generation of stored content a sitting is filed against.
 *
 * Bumped by hand when the shape of the content changes in a way that makes
 * old answers unreadable as answers to the questions actually asked. A
 * reworded prompt does not bump it.
 */
export const HLI_CONTENT_VERSION = 1;

/**
 * The name and the area, in code rather than in a copy table.
 *
 * These two are read synchronously by the assignable catalog, the shared
 * assignment name map and the coach's status block, all of which are pure
 * functions with no database of their own.
 */
export const HLI_LABEL = 'Health & Lifestyle Intake';
export const HLI_AREA = 'Health history';

/** The one table a sitting lives in (migration 230). Named once. */
export const HLI_TABLE = 'member_health_intake_sessions' as const;
