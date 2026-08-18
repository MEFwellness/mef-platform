/**
 * Whether an exercise gets a weight field, and what that field says.
 *
 * THE RULE IS READ OFF THE PRESCRIPTION, not off a list of exercise names
 * and not off the block. What a member is looking at when she decides
 * whether a weight is even a sensible thing to record is the prescription
 * itself: "1 set of 60 seconds" is a hold and there is no weight to say,
 * "3 sets of 8" is a set of reps and there might be. Deriving it any other
 * way would mean a second opinion about what an exercise is, kept
 * somewhere else, drifting.
 *
 * TWO THINGS THE COACH ASKED FOR EXPLICITLY, and both are here rather than
 * in a screen:
 *
 *   a hold or a timed exercise gets NO field at all. Not a disabled one,
 *   not an empty one. There is nothing to say and a box asking anyway is
 *   a box that makes her feel she has missed something.
 *
 *   a bodyweight strength movement gets one ANYWAY. Plenty of people hold
 *   a dumbbell across their hips for a glute bridge, and a program that
 *   says bodyweight is describing its own minimum, not policing her.
 *
 * IT IS NEVER REQUIRED. Nothing on any screen blocks on it, nothing counts
 * it, nothing scores it and nothing nags about a blank one. It exists so
 * that her coach, and the progression work that comes after this, can see
 * what she actually did.
 *
 * NO EM DASHES, per the house rule.
 */
import type { CoachAssignedWorkoutExercise } from '@mef/shared-types-contracts';

/** The two units a member picks between. The catalog's own load_unit vocabulary is wider (band, bodyweight, other), and none of the rest is a number she can type. */
export type LoggedLoadUnit = 'lbs' | 'kg';

export const LOGGED_LOAD_UNITS: readonly LoggedLoadUnit[] = ['lbs', 'kg'];

/** What the app falls back to when nothing else says. Pounds, which is what every other weight in this product is in (see the protein profile's body weight field). */
export const DEFAULT_LOGGED_LOAD_UNIT: LoggedLoadUnit = 'lbs';

/** The bounds the database check constraint enforces, repeated here so a screen can refuse a nonsense number before it becomes an error. */
export const MIN_LOGGED_LOAD = 0.5;
export const MAX_LOGGED_LOAD = 2000;

type PrescriptionShape = Pick<
  CoachAssignedWorkoutExercise,
  'reps' | 'rep_range_low' | 'rep_range_high' | 'hold_duration_seconds' | 'time_seconds'
>;

function statesReps(exercise: PrescriptionShape): boolean {
  if (exercise.rep_range_low !== null && exercise.rep_range_low !== undefined) return true;
  if (exercise.rep_range_high !== null && exercise.rep_range_high !== undefined) return true;
  const reps = (exercise.reps ?? '').trim();
  return reps !== '';
}

function statesTime(exercise: PrescriptionShape): boolean {
  return (
    (exercise.hold_duration_seconds ?? null) !== null || (exercise.time_seconds ?? null) !== null
  );
}

/**
 * True when a weight field belongs on this exercise.
 *
 * A prescription that states reps takes one. A prescription that states a
 * hold or a time and no reps does not. A prescription that states NEITHER,
 * which is what every program written before the dosing table looked like,
 * takes one: an exercise with no numbers at all is more likely to be
 * something she loads than something she holds, and an optional field she
 * ignores costs her nothing.
 */
export function acceptsWeightLog(exercise: PrescriptionShape): boolean {
  if (statesReps(exercise)) return true;
  return !statesTime(exercise);
}

/**
 * Which unit her field starts on: the unit she used last on this exercise
 * if there is one, otherwise the unit her coach prescribed in if that is a
 * number's unit, otherwise pounds. Whatever it starts on, she can change
 * it, and what she picks is what gets stored.
 */
export function initialLoadUnit(input: {
  lastLoggedUnit?: LoggedLoadUnit | null;
  prescribedUnit?: string | null;
}): LoggedLoadUnit {
  if (input.lastLoggedUnit === 'lbs' || input.lastLoggedUnit === 'kg') return input.lastLoggedUnit;
  const prescribed = (input.prescribedUnit ?? '').trim().toLowerCase();
  if (prescribed === 'lbs' || prescribed === 'kg') return prescribed;
  return DEFAULT_LOGGED_LOAD_UNIT;
}

/** A number typed into the field, or null when it is blank or not a usable weight. Blank is a real answer here, not an error. */
export function parseLoggedLoad(raw: string | null | undefined): number | null {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  if (value < MIN_LOGGED_LOAD || value > MAX_LOGGED_LOAD) return null;
  // Half a pound is as fine as anybody needs, and it is what the column
  // stores.
  return Math.round(value * 2) / 2;
}

/** What a logged weight reads as once it is saved, e.g. "25 lbs per side". */
export function formatLoggedLoad(input: {
  load: number | null;
  unit: LoggedLoadUnit | null;
  perSide: boolean;
}): string | null {
  if (input.load === null) return null;
  const amount = Number.isInteger(input.load) ? String(input.load) : String(input.load);
  const unit = input.unit ?? DEFAULT_LOGGED_LOAD_UNIT;
  return `${amount} ${unit}${input.perSide ? ' per side' : ''}`;
}

/**
 * The one line under the field, exactly as the coach wrote it. Kept here
 * rather than typed into two screens, because the list view and the
 * walk-through both show it and they must not drift apart.
 */
export const WEIGHT_LOG_HELPER_TEXT =
  'Log the weight you used. It helps your coach and the app plan your next weeks just right for you.';
