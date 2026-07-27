/**
 * Today page redesign — "earned capability" progress for the Accomplished
 * zone. Pulls the REAL gate the correlation engine already enforces
 * (lib/correlation-engine/evidence.ts) rather than inventing a member-
 * facing number: MIN_PAIRED_OBSERVATIONS is the minimum count of
 * genuinely-paired days before ANY relationship is even tested, and
 * MIN_SPAN_DAYS (also 21) requires those days to be spread out, not a
 * single dense burst. Both are per-driver-pair, not global — 18 seeded
 * pairs (correlation_candidate_pairs), each gated and tiered
 * independently. Showing 18 separate progress bars would read as a
 * scoreboard, not encouragement, so this uses the member's total logged
 * days as the single clearest honest proxy: it's a real, necessary
 * (though not sufficient — effect size and confidence still have to hold)
 * condition for every one of those 18 pairs, so "log N more days before
 * Root can start testing for real patterns" is true regardless of which
 * specific pair eventually qualifies.
 */

import { MIN_PAIRED_OBSERVATIONS } from '@/lib/correlation-engine/evidence';

export const CAPABILITY_LOG_DAYS_REQUIRED = MIN_PAIRED_OBSERVATIONS;

export interface CapabilityProgress {
  required: number;
  loggedDays: number;
  remaining: number;
  unlocked: boolean;
}

export function capabilityProgress(totalCheckins: number): CapabilityProgress {
  const loggedDays = Math.max(0, totalCheckins);
  const remaining = Math.max(0, CAPABILITY_LOG_DAYS_REQUIRED - loggedDays);
  return {
    required: CAPABILITY_LOG_DAYS_REQUIRED,
    loggedDays,
    remaining,
    unlocked: remaining === 0,
  };
}
