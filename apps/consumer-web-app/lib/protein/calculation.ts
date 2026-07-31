/**
 * Protein Phase 1a — target math. Deliberately config-in-code, not in the
 * database (same convention as correlation-engine weights and membership
 * tier ranks): the multiplier for a given activity level can be tuned here
 * without a migration.
 *
 * Formula (per the task spec): daily protein grams = body weight (lb) /
 * 2.2 x multiplier, rounded to the nearest 5g.
 */

import type { ActivityLevelKey } from './types';

export type ActivityLevelOption = {
  key: ActivityLevelKey;
  multiplier: number;
  label: string;
  description: string;
};

/**
 * Deliberately no age-based wording anywhere in these descriptions — the
 * platform does not collect age in this phase (per the task spec).
 */
export const ACTIVITY_LEVELS: ActivityLevelOption[] = [
  {
    key: 'general_wellness',
    multiplier: 1.0,
    label: 'Low activity, general wellness',
    description: "You're not doing structured exercise most days — your focus right now is overall health, not training.",
  },
  {
    key: 'regular_movement',
    multiplier: 1.2,
    label: 'Regular movement or beginner strength training',
    description: "You move consistently, or you're newer to structured resistance training.",
  },
  {
    key: 'resistance_training_or_fat_loss',
    multiplier: 1.4,
    label: 'Consistent resistance training, or fat loss while keeping muscle',
    description: "You train with resistance on a regular basis, or you're working to lose fat while protecting the muscle you have.",
  },
  {
    key: 'muscle_building_emphasis',
    multiplier: 1.6,
    label: 'Muscle-building emphasis',
    description: 'Building muscle is the main goal driving your training right now.',
  },
];

const MULTIPLIER_BY_KEY: Record<ActivityLevelKey, number> = Object.fromEntries(
  ACTIVITY_LEVELS.map((option) => [option.key, option.multiplier])
) as Record<ActivityLevelKey, number>;

export function getActivityLevelOption(key: ActivityLevelKey): ActivityLevelOption {
  const option = ACTIVITY_LEVELS.find((o) => o.key === key);
  if (!option) throw new Error(`Unknown activity level: ${key}`);
  return option;
}

/** Rounds to the nearest 5g. Ties round up (Math.round's own convention), e.g. 72.5 -> 75. */
function roundToNearest5(value: number): number {
  return Math.round(value / 5) * 5;
}

export function computeProteinGrams(bodyWeightLb: number, activityLevel: ActivityLevelKey): number {
  const multiplier = MULTIPLIER_BY_KEY[activityLevel];
  const rawGrams = (bodyWeightLb / 2.2) * multiplier;
  return roundToNearest5(rawGrams);
}

export type ProteinGuidanceRange = { low: number; high: number };

/**
 * Monthly/self-guided members see a range, not a single prescribed
 * number. Width choice: +/-10% of the computed target, rounded to the
 * nearest 5g on each side, with a 10g floor so small targets still get a
 * meaningful spread instead of a near-zero band. Wide enough to read as
 * genuine guidance rather than a false-precision number, narrow enough to
 * still be useful day to day.
 */
export function getSuggestedProteinRange(computedGrams: number): ProteinGuidanceRange {
  const spread = Math.max(10, roundToNearest5(computedGrams * 0.1));
  return { low: computedGrams - spread, high: computedGrams + spread };
}
