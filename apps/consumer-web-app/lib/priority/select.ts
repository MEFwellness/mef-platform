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
 * The function returns a single SelectedPriority or null. Null is the
 * honest answer when a member has nothing at all to show yet, and the card
 * simply does not render; it is never a reason to fall back to invented
 * content.
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
} from './copy';

export function selectPriority(
  inputs: PriorityInputs,
  todayLocalDate: string
): SelectedPriority | null {
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

  // Nothing honest to show. The card does not render.
  return null;
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
  return rules;
}
