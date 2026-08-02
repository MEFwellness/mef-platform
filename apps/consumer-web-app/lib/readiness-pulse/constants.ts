/**
 * Readiness Pulse — free-tier Experience 3, the final conversation of the
 * free arc. Shared constants for the unified-runtime content authored in
 * supabase/migrations/00000000000141_readiness_pulse.sql. Mirrors
 * lib/life-signal-check/constants.ts's own role.
 */

export const RPL_KEY = 'readiness-pulse' as const;

export const SCREEN1_QUESTION_KEYS = ['rpl_q1', 'rpl_q2', 'rpl_q3'] as const;
export const SCREEN2_QUESTION_KEYS = ['rpl_q4', 'rpl_q5', 'rpl_q6', 'rpl_q7'] as const;
export const SCREEN3_QUESTION_KEYS = ['rpl_q8', 'rpl_q9'] as const;
export const Q9_KEY = 'rpl_q9';

export const RPL_EXPERIMENT_DURATION_DAYS = 7;

export type TriedBranch = 'tried' | 'never_started';

export type Q1Answer = 'first_real_try' | 'a_few_tries' | 'more_than_i_can_count' | 'never_started';

/** Only "I have thought about it but never started" is the never-started branch — a first real try still counts as "has tried" for Q2's own branch (she is, or has, actually attempted it). */
export function triedBranchFor(q1: Q1Answer): TriedBranch {
  return q1 === 'never_started' ? 'never_started' : 'tried';
}

export type Q2TriedAnswer = 'life_got_busy' | 'motivation_faded' | 'results_too_slow' | 'nobody_noticed';
export type Q2NeverStartedAnswer = 'never_right_time' | 'didnt_know_where' | 'afraid_wouldnt_stick' | 'nothing_forced_me';
export type Q2Answer = Q2TriedAnswer | Q2NeverStartedAnswer;

export type Q3Answer = 'overdue' | 'appealing_but_exhausting' | 'a_little_scary' | 'curious';

export type Q4Answer = 'room_if_protect' | 'small_pockets' | 'almost_none' | 'genuinely_open';

/** Q5's hypothetical maps directly onto the four coaching styles the wellness_coaching_style_profile table's tone_preference column now supports (migration 141 additively extends the enum — 'direct' already existed from the deterministic keyword classifier; 'meaning_anchored'/'adaptive'/'autonomous' are new). */
export type Q5Answer = 'direct' | 'meaning_anchored' | 'adaptive' | 'autonomous';

export type Q6Answer = 'schedule' | 'follow_through' | 'other_people' | 'expecting_too_much';

export type Q7Answer = 'easily_doable' | 'doable_good_days' | 'sounds_small_know_myself' | 'even_that_heavy';

/** Reuses Life Signal Check's own Signal type/labels — Question 8 asks which of the same six signals she'd most want changed, not a new vocabulary. */
export { SIGNALS, SIGNAL_LABEL, type Signal } from '../life-signal-check/constants';

export type Q9Answer = 'ready_now' | 'ready_if_small' | 'still_deciding' | 'not_yet';

/** The four readiness patterns — both the derived-formula output and the member's own Q9 pick share this exact vocabulary, so "did her pick diverge from the derived pattern" is a plain equality check, same shape as Life Signal Check's chosenSignal vs. loudestSignal. */
export type ReadinessPattern = 'ready_now' | 'ready_if_small' | 'still_deciding' | 'not_yet';

export const READINESS_PATTERN_LABEL: Record<ReadinessPattern, string> = {
  ready_now: 'Ready now',
  ready_if_small: "Ready, if it's small",
  still_deciding: 'Still deciding',
  not_yet: 'Not yet',
};
