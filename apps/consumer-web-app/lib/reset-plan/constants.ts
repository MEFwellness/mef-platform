/**
 * Personal Reset Plan — shared vocabulary. Reuses Life Signal Check's own
 * Signal type (the six focus areas) and Readiness Pulse's own
 * ReadinessPattern type (the four action tiers: Ready Now, Ready If It's
 * Small, Still Deciding, Not Yet) rather than inventing parallel enums —
 * the action library and the readiness sizing this experience draws on
 * are both already keyed by exactly these two vocabularies.
 */

import type { Signal } from '../life-signal-check/constants';
import type { ReadinessPattern } from '../readiness-pulse/constants';

export const RESET_PLAN_KEY = 'personal-reset-plan';

export type ResetPlanStatus = 'draft' | 'active';

/** Persisted so re-entering the creation flow resumes exactly where she left off, per the build's duplicate-protection requirement. */
export type ResetPlanScreen = 'intro' | 'proposal' | 'why' | 'action' | 'agreement' | 'closing' | 'done';

export const RESET_PLAN_SCREEN_ORDER: ResetPlanScreen[] = ['intro', 'proposal', 'why', 'action', 'agreement', 'closing', 'done'];

/** The action tier — identical vocabulary to Readiness Pulse's own ReadinessPattern, since Screen 4 sizes the action by her readiness pattern and she may shrink (never enlarge) from there. */
export type ActionTier = ReadinessPattern;

export const ACTION_TIERS: ActionTier[] = ['ready_now', 'ready_if_small', 'still_deciding', 'not_yet'];

/** Ordered thin -> full, so "shrink" always means moving left. */
export const ACTION_TIER_ORDER: Record<ActionTier, number> = {
  not_yet: 0,
  still_deciding: 1,
  ready_if_small: 2,
  ready_now: 3,
};

export function smallerTiers(tier: ActionTier): ActionTier[] {
  const rank = ACTION_TIER_ORDER[tier];
  return ACTION_TIERS.filter((t) => ACTION_TIER_ORDER[t] < rank).sort((a, b) => ACTION_TIER_ORDER[b] - ACTION_TIER_ORDER[a]);
}

/**
 * Screen 4's shrink control — plain description of the action each tier
 * switches to, never the tier's own internal name (READINESS_PATTERN_LABEL
 * above). A button reading "Not yet" reads as a refusal, not a smaller
 * option. `ready_now` is included only for type completeness; smallerTiers()
 * never returns it, since it is the largest tier, never a shrink target.
 */
export const RESET_PLAN_SHRINK_LABEL: Record<ActionTier, string> = {
  ready_now: 'The full version',
  ready_if_small: 'A smaller step',
  still_deciding: 'Notice, then a tiny step',
  not_yet: 'Just notice instead',
};

/** The three explicit daily states — a missing row is never a fourth implicit "miss" state, per the build's own accuracy rule. */
export type ResetPlanDailyState = 'completed_normal' | 'completed_difficult' | 'not_today';

export const RESET_PLAN_FOCUS_SIGNALS: Signal[] = ['energy', 'sleep', 'tension', 'digestion', 'body', 'mind'];

/** The one-time day-3 "how is it going" qualitative check-in — a separate question from the daily state tap above, stored on that day's own log row. */
export type ResetPlanDay3Response = 'going_well' | 'mixed' | 'not_started';

export const RESET_PLAN_DAY3_OPTIONS: { value: ResetPlanDay3Response; label: string }[] = [
  { value: 'going_well', label: 'Going well' },
  { value: 'mixed', label: 'Some days, not others' },
  { value: 'not_started', label: "Honestly, haven't started" },
];
