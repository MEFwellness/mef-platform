/**
 * HOW MUCH OF EACH EXERCISE. The starting prescription for every block of
 * a generated corrective program, per severity.
 *
 * THIS FILE IS MEANT TO BE EDITED BY A COACH. It is one table and nothing
 * else: no lookups, no conditionals, no interaction with the selection
 * engine. Changing a number here changes what the generator writes into
 * the NEXT program it produces. It cannot reach backwards. A program that
 * has already been approved and assigned is a frozen snapshot in
 * coach_assigned_workout_exercises, and nothing in this file is ever read
 * again for it. That is the point of the snapshot: a member's program is a
 * record of what her coach gave her on the day, not a live view of a
 * default that has since moved.
 *
 * THE CONVENTIONS THE NUMBERS FOLLOW, so an edit stays inside them:
 *
 *   Release    Self-myofascial work. Time under the roller or ball, one
 *              pass. Held, never counted in reps, never given a tempo.
 *   Mobility   Stretch and active range work. Also time-based holds.
 *   Stability  The main corrective work. Moderate sets of slow, controlled
 *              reps with an explicit tempo, because the speed IS the
 *              exercise here: a fast rep trains the pattern that is
 *              already dominant.
 *   Strength   Conventional sets and reps at a normal controlled tempo.
 *   Core       Anti-movement core stability, so timed holds rather than
 *              reps. Nothing in this block is ever a crunch (the pool
 *              excludes spinal-flexion work entirely).
 *
 * SEVERITY MAY REDUCE VOLUME, NEVER INCREASE IT. A more severe pattern
 * already receives MORE exercises per session (see blockBudgets.ts), so
 * holding per-exercise volume flat or dropping it is what keeps the
 * session honest. Every column below is checked by
 * tests/corrective-dosing.test.ts against that rule, so a future edit that
 * gives a severe member more work per exercise than a mild one fails the
 * suite rather than reaching a member.
 *
 * The Strength row for `severe` is written out even though no severe
 * program contains a Strength block today (its budget is 0 and the section
 * is omitted entirely). Leaving a hole there would mean a future change to
 * the budgets silently produced a block with no prescription.
 */
import type { CorrectiveSeverity, SessionBlockType } from './types';

/**
 * One block's starting prescription. Either a hold (`holdSeconds`) or reps
 * (`reps`), never both, matching the convention for that block.
 */
export interface BlockDose {
  sets: number;
  /** Time-based work: seconds held per set. Null for rep-based blocks. */
  holdSeconds: number | null;
  /** Rep-based work: reps per set. Null for time-based blocks. */
  reps: number | null;
  /** Only where the speed of the rep is part of the exercise. Null for holds. */
  tempo: string | null;
  /** Seconds of rest after each set. */
  restSeconds: number;
}

/**
 * THE DOSING TABLE. Block by severity. Every value a coach would change.
 */
export const CORRECTIVE_DOSING: Record<SessionBlockType, Record<CorrectiveSeverity, BlockDose>> = {
  release: {
    mild: { sets: 1, holdSeconds: 60, reps: null, tempo: null, restSeconds: 15 },
    moderate: { sets: 1, holdSeconds: 60, reps: null, tempo: null, restSeconds: 15 },
    severe: { sets: 1, holdSeconds: 45, reps: null, tempo: null, restSeconds: 20 },
  },
  mobility: {
    mild: { sets: 2, holdSeconds: 30, reps: null, tempo: null, restSeconds: 15 },
    moderate: { sets: 2, holdSeconds: 30, reps: null, tempo: null, restSeconds: 15 },
    severe: { sets: 1, holdSeconds: 30, reps: null, tempo: null, restSeconds: 20 },
  },
  stability: {
    mild: { sets: 2, holdSeconds: null, reps: 10, tempo: '3-1-3', restSeconds: 30 },
    moderate: { sets: 2, holdSeconds: null, reps: 10, tempo: '3-1-3', restSeconds: 45 },
    severe: { sets: 2, holdSeconds: null, reps: 8, tempo: '3-1-3', restSeconds: 60 },
  },
  strength: {
    mild: { sets: 3, holdSeconds: null, reps: 10, tempo: '2-0-2', restSeconds: 60 },
    moderate: { sets: 3, holdSeconds: null, reps: 8, tempo: '2-0-2', restSeconds: 75 },
    severe: { sets: 2, holdSeconds: null, reps: 8, tempo: '2-0-2', restSeconds: 90 },
  },
  core: {
    mild: { sets: 2, holdSeconds: 30, reps: null, tempo: null, restSeconds: 30 },
    moderate: { sets: 2, holdSeconds: 30, reps: null, tempo: null, restSeconds: 30 },
    severe: { sets: 2, holdSeconds: 20, reps: null, tempo: null, restSeconds: 45 },
  },
};

/**
 * The prescription fields the generator writes for one exercise in one
 * block. Exactly the subset of ExercisePrescriptionFields this engine has
 * an opinion about — load, band colour, RPE, side and the rest stay null,
 * because inventing a number a coach did not choose is worse than leaving
 * the field for her to fill.
 */
export interface BlockPrescription {
  sets: number;
  reps: string | null;
  rep_range_low: number | null;
  rep_range_high: number | null;
  hold_duration_seconds: number | null;
  tempo: string | null;
  rest_seconds: number;
}

/**
 * Look the dose up and shape it the way the template/assignment tables
 * store it. The only function in this file, and it does no arithmetic:
 * what a coach reads in the table above is exactly what is written.
 */
export function blockPrescription(
  block: SessionBlockType,
  severity: CorrectiveSeverity
): BlockPrescription {
  const dose = CORRECTIVE_DOSING[block][severity];
  return {
    sets: dose.sets,
    reps: dose.reps === null ? null : String(dose.reps),
    rep_range_low: dose.reps,
    rep_range_high: dose.reps,
    hold_duration_seconds: dose.holdSeconds,
    tempo: dose.tempo,
    rest_seconds: dose.restSeconds,
  };
}
