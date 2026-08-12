/**
 * Priority Card — the selection hierarchy. Pure, no I/O, so the decision
 * itself is directly unit-testable with no database involved, the same
 * draft/service split every other engine in this codebase uses.
 *
 * Exactly one winner, chosen by the first rule that applies:
 *
 *   0. RE-ENTRY (override, not a rank). Absent 7+ days, decided by
 *      lib/return-greeting/absence.ts. Suspends the ladder entirely.
 *   1. An active Reset Plan commitment not completed today.
 *   2. A strongly implicated driver relevant to her stated goal.
 *      'implicated' only, never 'watching' — that filtering happens
 *      upstream in the service, so this file can never accidentally admit
 *      a weaker state.
 *   3. An incomplete high-value action she started and abandoned.
 *   4. Otherwise, Today's Focus.
 *
 *   5/6. The final fallback (daily_reset / gentle_focus), added by the
 *      pop-up delivery fix. Structurally last, and always applicable, so
 *      the function is TOTAL for a signed-in member: it always returns a
 *      priority, never null. That is what lets the pop-up be guaranteed to
 *      have something to say without ever inventing an insight, since the
 *      fallback makes no claim about the member at all.
 */

import type { PriorityInputs, PriorityRule, SelectedPriority } from './types';
import {
  RE_ENTRY_HELP_TEXT,
  RE_ENTRY_PRIORITY_TEXT,
  buildDriverHelp,
  buildDriverReason,
  buildDriverTitle,
  buildIncompleteActionHelp,
  buildIncompleteActionReason,
  buildIncompleteActionTitle,
  buildResetPlanHelp,
  buildResetPlanReason,
  buildResetPlanTitle,
  buildTodaysFocusHelp,
  buildTodaysFocusReason,
  buildTodaysFocusTitle,
  buildDailyResetHelp,
  buildDailyResetReason,
  buildDailyResetTitle,
  buildGentleFocusHelp,
  buildGentleFocusReason,
  buildGentleFocusTitle,
} from './copy';

export function selectPriority(
  inputs: PriorityInputs,
  todayLocalDate: string
): SelectedPriority {
  // Rule 0 — the override. Checked before anything else and returning
  // immediately, so no ladder rule can ever be evaluated for a returning
  // member. This is what "the normal ladder is suspended" means in code:
  // not a re-entry priority that happens to sort first, but a branch the
  // ladder never runs inside of.
  if (inputs.isReEntry) {
    return {
      rule: 're_entry',
      priorityKey: null,
      title: RE_ENTRY_PRIORITY_TEXT,
      // Never a reason line. The only fact available is the length of her
      // absence, and naming it is the guilt this whole state exists to
      // avoid. See copy.ts.
      reason: null,
      help: RE_ENTRY_HELP_TEXT,
      href: null,
    };
  }

  // Rule 1.
  if (inputs.resetPlan) {
    return {
      rule: 'reset_plan_commitment',
      priorityKey: inputs.resetPlan.planId,
      title: buildResetPlanTitle(inputs.resetPlan),
      reason: buildResetPlanReason(inputs.resetPlan),
      help: buildResetPlanHelp(inputs.resetPlan),
      href: null,
    };
  }

  // Rule 2.
  if (inputs.implicatedDriver) {
    return {
      rule: 'implicated_driver',
      priorityKey: inputs.implicatedDriver.driverId,
      title: buildDriverTitle(inputs.implicatedDriver),
      reason: buildDriverReason(inputs.implicatedDriver),
      help: buildDriverHelp(inputs.implicatedDriver),
      href: null,
    };
  }

  // Rule 3.
  if (inputs.incompleteAction) {
    return {
      rule: 'incomplete_action',
      priorityKey: inputs.incompleteAction.key,
      title: buildIncompleteActionTitle(inputs.incompleteAction),
      reason: buildIncompleteActionReason(inputs.incompleteAction, todayLocalDate),
      help: buildIncompleteActionHelp(inputs.incompleteAction),
      href: inputs.incompleteAction.href,
    };
  }

  // Rule 4.
  if (inputs.todaysFocus) {
    return {
      rule: 'todays_focus',
      priorityKey: inputs.todaysFocus.feedItemId,
      title: buildTodaysFocusTitle(inputs.todaysFocus),
      reason: buildTodaysFocusReason(inputs.todaysFocus, inputs.hasRealHistory),
      help: buildTodaysFocusHelp(inputs.todaysFocus),
      href: null,
    };
  }

  // The final fallback. Everything above came up empty, which is the
  // ordinary state of a brand-new member. Exactly one of these two always
  // applies, so `selectPriority` is total for a signed-in member and the
  // pop-up always has something honest to carry.
  //
  // Neither branch makes a claim about her. The first offers the Daily
  // Reset, the product's real core loop; the second quotes her own stated
  // goal back to her. Both are reached only after every evidence-backed
  // rule has declined to speak.
  if (!inputs.fallback.checkinDoneToday) {
    return {
      rule: 'daily_reset',
      priorityKey: null,
      title: buildDailyResetTitle(),
      reason: buildDailyResetReason(inputs.fallback),
      help: buildDailyResetHelp(),
      href: '/checkin',
    };
  }

  return {
    rule: 'gentle_focus',
    priorityKey: null,
    title: buildGentleFocusTitle(inputs.fallback),
    reason: buildGentleFocusReason(inputs.fallback),
    help: buildGentleFocusHelp(inputs.fallback),
    href: null,
  };
}

/**
 * Which ladder rules COULD have won for these inputs, ignoring precedence.
 * Exists purely so the guard tests can prove a rule's win was a real
 * precedence decision rather than the only option available, which is what
 * makes those tests non-vacuous. Never used by the app itself.
 */
export function applicableRules(inputs: PriorityInputs): PriorityRule[] {
  const rules: PriorityRule[] = [];
  if (inputs.isReEntry) rules.push('re_entry');
  if (inputs.resetPlan) rules.push('reset_plan_commitment');
  if (inputs.implicatedDriver) rules.push('implicated_driver');
  if (inputs.incompleteAction) rules.push('incomplete_action');
  if (inputs.todaysFocus) rules.push('todays_focus');
  // The fallback always contributes exactly one applicable rule, which is
  // why the ladder can never come up empty. Included here so the guard
  // tests can show the fallback was genuinely available and genuinely lost
  // whenever a real rule won.
  rules.push(inputs.fallback.checkinDoneToday ? 'gentle_focus' : 'daily_reset');
  return rules;
}
