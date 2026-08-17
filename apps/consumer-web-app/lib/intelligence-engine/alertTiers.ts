/**
 * Two tiers, and only two.
 *
 * The audit found the coach-alert system running its own three-value scale,
 * `important` / `notable` / `info`, with no relationship to the safety
 * system's tiering and no rule about what belonged where. A possible
 * burnout risk and an overdue reassessment could both land on `notable`, so
 * `notable` meant nothing: a coach could not tell from the tier whether to
 * pick up the phone or make a note.
 *
 * The safety system (`lib/safety/categories.ts`) is the reference
 * implementation and is untouched by this file. What it does right is that
 * every category carries an explicit answer to "does somebody have to act on
 * this now", and that answer is a property of the category rather than a
 * judgement made at render time.
 *
 * So every alert now resolves to exactly one of:
 *
 *   urgent_safety      Somebody needs to reach her. Routed and worded the way
 *                      the safety system words things, and always sitting
 *                      apart from the routine list rather than above it in
 *                      the same list.
 *   routine_follow_up  Something for the coach to pick up in the normal run
 *                      of work. Worded as routine, explicitly, so it can
 *                      never read as vaguely alarming.
 *
 * There is deliberately no middle. A middle tier is what produced
 * "possible burnout risk" and "reassessment overdue" wearing the same badge.
 *
 * The mapping is keyed on `alertType`, which is a stored column, so alerts
 * written months ago resolve the same way as alerts written today, and it is
 * an exhaustive `Record`, so a new alert type is a TYPE ERROR here rather
 * than an alert that quietly has no tier.
 */

import type { IntelligenceAlertType } from '@mef/shared-types-contracts';

export type AlertTier = 'urgent_safety' | 'routine_follow_up';

export const ALERT_TIERS: readonly AlertTier[] = ['urgent_safety', 'routine_follow_up'] as const;

/**
 * Which alerts are an urgent safety concern, and why each one.
 *
 * The bar is the safety system's own bar: a person has to be contacted,
 * and waiting for the next scheduled touchpoint is not good enough. Two
 * alert types clear it, and both of them clear it because a safety
 * classification already exists behind them. Nothing else does, and in
 * particular a burnout signal does not: it is a real thing worth raising,
 * it is derived from trend data rather than from anything she disclosed,
 * and dressing it as urgent is the exact overstatement this build removes.
 */
export const ALERT_TIER_BY_TYPE: Readonly<Record<IntelligenceAlertType, AlertTier>> = {
  /** Produced only from a `medical_evaluation_recommended` safety classification or a sustained strong pain trend. */
  medical_evaluation_recommended: 'urgent_safety',
  /** Produced only when open Coach Review Queue cases have accumulated. The queue is the safety system. */
  repeated_safety_flags: 'urgent_safety',

  needs_review: 'routine_follow_up',
  burnout_risk: 'routine_follow_up',
  assessment_overdue: 'routine_follow_up',
  no_checkin: 'routine_follow_up',
  symptoms_worsening: 'routine_follow_up',
  rapid_improvement: 'routine_follow_up',
  plateau: 'routine_follow_up',
  recurring_barriers: 'routine_follow_up',
  assessment_finding_requires_attention: 'routine_follow_up',
};

/**
 * The tier for one alert. Total: every alert type has an entry above, and an
 * unrecognised value from an older row resolves to routine follow-up rather
 * than to nothing, because an alert with no tier cannot be rendered at all
 * and silently dropping a coach's alert is worse than under-grading it.
 */
export function alertTier(alertType: string): AlertTier {
  return ALERT_TIER_BY_TYPE[alertType as IntelligenceAlertType] ?? 'routine_follow_up';
}

/** How each tier is labelled wherever alerts are shown. Plain, and never a bare severity word. */
export const ALERT_TIER_LABEL: Readonly<Record<AlertTier, string>> = {
  urgent_safety: 'Needs a response today',
  routine_follow_up: 'Routine follow-up',
};

/** One sentence saying what the tier asks of the coach. Shown next to the label so the badge is never the only explanation. */
export const ALERT_TIER_MEANING: Readonly<Record<AlertTier, string>> = {
  urgent_safety:
    'Something here has been flagged by the safety system. Reach her today and log what happened in the review queue.',
  routine_follow_up:
    'Nothing here is urgent. Pick it up at your next conversation with her.',
};

/**
 * The stored `severity` column keeps its three legal values because a
 * hundred rows already carry them and a check constraint enforces them.
 * Nothing renders from it any more; the tier is what a coach reads. This is
 * the one place the two are related, so a future reader can see that the
 * column is an audit trail rather than a display field.
 */
export function storedSeverityForTier(tier: AlertTier): 'important' | 'notable' {
  return tier === 'urgent_safety' ? 'important' : 'notable';
}

/** Urgent first, and within a tier the order the producers emitted them. */
export function sortByTier<T extends { alertType: string }>(alerts: readonly T[]): T[] {
  return [...alerts].sort((a, b) => {
    const rank = (t: string) => (alertTier(t) === 'urgent_safety' ? 0 : 1);
    return rank(a.alertType) - rank(b.alertType);
  });
}
