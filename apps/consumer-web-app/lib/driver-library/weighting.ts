/**
 * Driver Library — goal -> driver weighting (Part 2 of
 * MEF-driver-library-v1.md), plus Part 3's three goals that behave
 * differently. Pure, no I/O — lib/daily-checkin-adaptive/ is the only
 * caller.
 */

import type { DriverGoalWeight } from './types';

export const GOAL_WEIGHT_SCORE = { high: 3, medium: 2, low: 1 } as const;

/**
 * "Better understand my body ... drivers get sampled broadly rather than
 * weighted" (Part 3) — the same flat score also covers a member with no
 * real goal on file at all (never went through goal selection), and
 * 'work directly with a coach' ("not a goal in the driver sense ... if
 * selected alongside real goals, ignore it for driver weighting")
 * whenever it's the only thing selected. 'something else' needs her free
 * text mapped to a driver before it can weight anything (Part 3) — until
 * that mapping exists, it falls back to the same broad score rather than
 * contributing nothing.
 */
export const BROAD_SAMPLING_SCORE = GOAL_WEIGHT_SCORE.medium;

/** Goal keys (lib/welcome/goals.ts's WELCOME_GOALS) that never weight a driver directly — see Part 3. */
const NON_WEIGHTING_GOAL_KEYS = new Set(['understand_my_body', 'work_with_coach', 'something_else']);

/**
 * A member's goal keys, narrowed to the ones that actually point at a
 * driver_goal_weights row — 'work_with_coach' is dropped even when other
 * real goals are present ("ignore it for driver weighting and use the
 * others" — Part 3), never causing a fallback to broad sampling on its
 * own.
 */
export function realWeightingGoals(memberGoalKeys: readonly string[]): string[] {
  return memberGoalKeys.filter((key) => !NON_WEIGHTING_GOAL_KEYS.has(key));
}

/**
 * The member's own goal weighting for one driver — the highest weight
 * across any of her real goals that name it (a driver shared across
 * several selected goals, e.g. SLP-2 under pain + energy + sleep, rises
 * to the top from this alone, no extra logic — Part 4's own framing).
 * Falls back to BROAD_SAMPLING_SCORE when she has no real weighting goal
 * at all (see realWeightingGoals).
 */
export function goalWeightScoreForDriver(
  driverId: string,
  memberGoalKeys: readonly string[],
  weightRows: readonly DriverGoalWeight[]
): number {
  const realGoals = realWeightingGoals(memberGoalKeys);
  if (realGoals.length === 0) return BROAD_SAMPLING_SCORE;

  const realGoalSet = new Set(realGoals);
  const matches = weightRows.filter((row) => row.driverId === driverId && realGoalSet.has(row.goalKey));
  if (matches.length === 0) return GOAL_WEIGHT_SCORE.low;

  return Math.max(...matches.map((row) => GOAL_WEIGHT_SCORE[row.weight]));
}
