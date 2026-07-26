/**
 * Daily check-in adaptive picker — rotating-probe scoring. Pure, no I/O.
 * "For each driver: the member's goal weighting, multiplied by how long
 * since it was last asked, multiplied by how uncertain its state still
 * is" (requirement 4) — a genuine product of three factors, each kept
 * close to a 1.0-ish scale so the combined weight stays comparable to
 * lib/onboarding/concernBanks/*'s own question weights (small floats,
 * typically 1-3) — that's what keeps
 * lib/adaptive-assessment-engine/select.ts's fixed "within 1 point of
 * the best score" tiebreak meaningful here instead of collapsing to a
 * single deterministic winner every time.
 */

import type { DriverState } from '../driver-library/types';
import { RECENCY_CAP_DAYS } from './constants';

/** How overdue a driver is to be asked about again, as a multiplier — 1.0 at "asked today" (never actually offered, since same-day exclusion keeps it out of the bank at all) up to a cap at RECENCY_CAP_DAYS so a driver unasked for months doesn't dominate forever. Never asked at all scores as maximally overdue. */
export function recencyFactor(daysSinceLastAsked: number | null): number {
  const days = daysSinceLastAsked === null ? RECENCY_CAP_DAYS : Math.min(daysSinceLastAsked, RECENCY_CAP_DAYS);
  return 1 + days * 0.1;
}

/**
 * unknown/watching are equally "still worth investigating" (both mean
 * the correlation engine hasn't reached a verdict yet); implicated is
 * lower but not zero, so a confirmed driver is still periodically
 * reconfirmed rather than dropped; ruled_out is handled by exclusion
 * from the bank entirely (requirement 4's "score zero and stop
 * appearing"), not by this factor, so it never reaches this function in
 * practice.
 */
export function uncertaintyFactor(state: DriverState): number {
  switch (state) {
    case 'unknown':
    case 'watching':
      return 1.2;
    case 'implicated':
      return 0.6;
    case 'ruled_out':
      return 0;
  }
}

export function probeWeight(goalWeightScore: number, daysSinceLastAsked: number | null, state: DriverState): number {
  return goalWeightScore * recencyFactor(daysSinceLastAsked) * uncertaintyFactor(state);
}
