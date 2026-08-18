/**
 * READINESS VOCABULARY. The four names that survived the retired
 * Prescription Intelligence Engine (migration 178's cleanup).
 *
 * This file used to type four tables (prescription_snapshots,
 * prescription_blocks, prescription_block_exercises,
 * prescription_constraints, migration 83) and the engine that wrote them.
 * Every one of those tables is empty in production and always was: the
 * engine never produced a single row. The engine, its two coach screens,
 * its server action and its row types are all deleted.
 *
 * What survives is the vocabulary the CONSTRAINT LADDER speaks, because the
 * ladder itself survives and is now genuinely live:
 * apps/consumer-web-app/lib/programs/readiness/{facts,constraints,gate}.ts,
 * read by lib/programs/feedback/safety.ts (a member reporting pain on an
 * exercise) and lib/programs/review/recommend.ts (the end-of-phase review's
 * readiness rung).
 *
 * The four tables are LEFT IN PLACE in the database. Dropping a table is a
 * separate decision from deleting the code that never filled it, and it was
 * not asked for.
 *
 * The names keep their `Prescription` prefix on purpose: they are the check
 * constraint values on prescription_constraints, and renaming a type whose
 * strings are a live database constraint would make the type and the column
 * disagree.
 */

/** Why nothing should be decided from data alone right now. */
export type PrescriptionBlockReason =
  | 'red_flag'
  | 'missing_baseline_assessment'
  | 'missing_movement_assessment'
  | 'extremely_poor_readiness'
  | 'insufficient_data';

/** What to do instead. `recovery_session` is what the end-of-phase review renders as its "Schedule a recovery week" outcome. */
export type PrescriptionRecommendedAlternative =
  | 'recovery_session'
  | 'mobility_session'
  | 'breathing_session'
  | 'coach_review'
  | 'medical_follow_up';

/** The kinds of thing that constrain what a member should be asked to do. Mirrors prescription_constraints.constraint_type. */
export type PrescriptionConstraintType =
  | 'poor_breathing'
  | 'limited_mobility'
  | 'poor_recovery'
  | 'pain'
  | 'movement_dysfunction'
  | 'high_stress'
  | 'sleep_deprivation'
  | 'red_flag'
  | 'missing_assessment';

/** How hard a constraint pushes back. `blocking` is the rung a member's own pain report enters at. */
export type PrescriptionConstraintSeverity = 'low' | 'moderate' | 'high' | 'blocking';
