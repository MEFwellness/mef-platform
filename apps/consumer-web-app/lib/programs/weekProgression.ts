/**
 * Per scheduled week progression, resolved at assignment time.
 *
 * A corrective program is four identical weeks. An authored named program
 * usually is not: week 3 adds a set. The plan for that lives on the
 * blueprint slot and travels to the template exercise as `week_overrides`
 * (migration 174), keyed by week number:
 *
 *   { "3": { sets: 4 } }
 *
 * These are pure functions with no Supabase import, so the numbers can be
 * checked without a database, and so the rule lives in one place rather
 * than inside the loop that writes rows.
 *
 * TWO THINGS THIS DELIBERATELY DOES NOT DO.
 *
 * It does not interpolate. Week 2 with no entry of its own is week 1's
 * prescription, not something halfway to week 3. A progression a coach did
 * not write is not a progression.
 *
 * It does not survive into read time. The resolved values are written into
 * the frozen coach_assigned_workout_exercises row for that week, so week
 * 3's row says sets = 4 outright. A snapshot that needs a second table
 * consulted to know what it prescribed is not a snapshot.
 */
import type { ProgramWeekOverride } from '@mef/shared-types-contracts';

/** The prescription fields an override may change, as they are stored. */
export interface WeekResolvablePrescription {
  sets: number | null;
  reps: string | null;
  rep_range_low: number | null;
  rep_range_high: number | null;
  hold_duration_seconds: number | null;
  tempo: string | null;
  rest_seconds: number | null;
}

/**
 * Which week of the program a date falls in, counted from the start date.
 * Week 1 is the start date and the six days after it. A date before the
 * start date is week 1 rather than week 0 or a negative: an occurrence
 * scheduled before its own program starts is a scheduling question, not a
 * reason to prescribe nothing.
 */
export function programWeekOf(startDate: string, scheduledDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const on = Date.parse(`${scheduledDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(on)) return 1;
  const days = Math.floor((on - start) / 86_400_000);
  return days < 0 ? 1 : Math.floor(days / 7) + 1;
}

/** The override for one week, or null when that week keeps the base prescription. */
export function overrideForWeek(
  overrides: Record<string, ProgramWeekOverride> | null | undefined,
  week: number
): ProgramWeekOverride | null {
  if (!overrides) return null;
  const entry = overrides[String(week)];
  if (!entry || typeof entry !== 'object') return null;
  return entry;
}

/**
 * The base prescription with one week's override applied over it. Fields
 * the override says nothing about keep their base value.
 *
 * reps is stored as text on the prescription tables and as a number on the
 * override, so an overridden rep count updates `reps`, `rep_range_low` and
 * `rep_range_high` together — the same three fields the corrective dosing
 * lookup writes together (lib/corrective-engine/dosing.ts). Leaving the
 * range behind would let a screen reading the range disagree with a screen
 * reading the count.
 */
export function applyWeekOverride<T extends WeekResolvablePrescription>(
  base: T,
  override: ProgramWeekOverride | null
): T {
  if (!override) return base;

  const resolved: T = { ...base };
  if (typeof override.sets === 'number') resolved.sets = override.sets;
  if (typeof override.reps === 'number') {
    resolved.reps = String(override.reps);
    resolved.rep_range_low = override.reps;
    resolved.rep_range_high = override.reps;
  }
  if (typeof override.hold_duration_seconds === 'number') {
    resolved.hold_duration_seconds = override.hold_duration_seconds;
  }
  if (typeof override.tempo === 'string') resolved.tempo = override.tempo;
  if (typeof override.rest_seconds === 'number') resolved.rest_seconds = override.rest_seconds;

  return resolved;
}
