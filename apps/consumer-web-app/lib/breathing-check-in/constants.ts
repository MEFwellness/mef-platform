/**
 * The Breathing Pattern Check-In, in one place: what it is called, what it
 * is addressed by, and how long a coach's assignment is given.
 *
 * IT IS A SEPARATE INSTRUMENT, and the separation is the whole point of
 * the family it joins. The MEF Body Systems Survey (lib/body-systems/) says
 * which systems are speaking loudly. The MEF Whole-Body Signal Assessment
 * (lib/whole-body-signal/) reads the same body a different way. The Health
 * & Lifestyle Intake (lib/health-intake/) is the context all of them are
 * read against. The Stress & Load Deep-Dive (lib/stress-load/) goes deeper
 * on one subject when a coach decides it is warranted. This one reads ONE
 * thing, breathing pattern and the sensations that travel with it, and
 * nothing in this folder reads, writes, renames or retires any of them.
 *
 * The database id is FIXED and must match
 * supabase/migrations/00000000000231_breathing_pattern_check_in.sql
 * exactly, so local, staging and production all resolve this experience to
 * the same definition. Same convention as migrations 70, 190, 211 through
 * 220, 225 and 230.
 */

/** The catalog key. Matches assessment_definitions.key. */
export const BPC_KEY = 'breathing-pattern-check-in' as const;

/** assessment_definitions.id. Fixed, and shared with migration 231. */
export const BPC_DEFINITION_ID = '2f6a8c31-9d47-4b58-a0e3-6c1b7d92f405';

/** The route the pop-up, the Home card and the coach's own link all point at. */
export const BPC_ROUTE = '/breathing-check-in';

/**
 * How long an assignment is given when the coach names no day.
 *
 * Seven days, the same default every other coach assigned experience in
 * this app carries, so "overdue" means one thing across the whole ledger.
 */
export const BPC_DEFAULT_DUE_IN_DAYS = 7;

/**
 * The generation of the VALIDATED instrument a sitting is filed against.
 *
 * Bumped ONLY by a reviewed change to ./instrument.ts: a question moved, a
 * response label moved, a point value moved, or the maximum moved. A
 * reworded Rooted Reset sentence does NOT bump it, because nothing about
 * the sixteen answers changes when the frame around them is rewritten.
 *
 * Two sittings filed under one version are genuinely comparable, which is
 * the only reason this number exists.
 */
export const BPC_CONTENT_VERSION = 1;

/**
 * The name, in code rather than in a copy table.
 *
 * This is the MEMBER FACING name and it is the only name this constant
 * carries, because it is read by the assignable catalog, the shared
 * assignment name map, the coach's status block and her own screens, all
 * at once. What the underlying instrument is called lives in
 * ./coachCopy.ts, which no member surface imports.
 */
export const BPC_LABEL = 'Breathing Pattern Check-In';
export const BPC_AREA = 'Breathing';

/** The one table a sitting lives in (migration 231). Named once. */
export const BPC_TABLE = 'member_breathing_check_in_sessions' as const;
