/**
 * The Adaptive Coaching Direction engine — the decision itself. Pure, no
 * I/O, so what Root chooses is directly unit-testable with no database
 * involved, the same draft/service split every other engine in this
 * codebase uses.
 *
 * It is the brain behind the Priority Card, and it is a DECISION layer,
 * not an intelligence layer. Every signal below was computed and published
 * by a system that shipped before it. This file adds one thing: of
 * everything true about this member today, which single thing deserves the
 * top of her screen, and on which framing.
 *
 * THE HIERARCHY. Exactly one winner, chosen by the first rule that
 * applies. Two of them are overrides, which suspend the ladder rather than
 * topping it:
 *
 *   OVERRIDE  safety     An unresolved safety flag from a check-in. The
 *                        strongest state there is. Nothing else fires.
 *   OVERRIDE  re_entry   Absent long enough to count as a real absence,
 *                        decided by lib/return-greeting/absence.ts.
 *   1  reset_plan_commitment  An active commitment not completed today.
 *   2  implicated_driver      A Case View implicated, goal-relevant driver.
 *   3  qualified_pattern      A tier 3 correlation finding.
 *   4  incomplete_action      Something high-value she started and left.
 *   5  behavioral_friction    A repeated stuck behavior, made easier.
 *   6  todays_focus           The Coaching Brain's selection for today.
 *   7/8 daily_reset / gentle_focus  The final fallback, unchanged.
 *
 * The fallback is always applicable, so this function is TOTAL for a
 * signed-in member: it always returns a priority, never null. That is what
 * lets the pop-up be guaranteed to have something to say without ever
 * inventing an insight, since the fallback makes no claim about her.
 *
 * THE GUARDRAILS. `selectCoachingAction` additionally applies the
 * adaptation rules in lib/coaching-direction/adaptation.ts: an escalated
 * thread is never selected, a thread ignored three days running changes
 * framing, a thread that has changed framing twice with no response is
 * handed to a coach and dropped, and a thread she finished yesterday is
 * preferred over an unrelated one. All four operate on counters. None of
 * them can see, or is given, any health data.
 *
 * THE WEEK FOCUS (Part 2). `selectCoachingAction` optionally receives the
 * Weekly Root Review's focus for the current week and uses it as a
 * TIE-BREAKER. The ladder admits at most one candidate per rung, so two
 * candidates are only ever tied when their rung's own source produced
 * several equally-ranked items (several implicated drivers, several tier 3
 * findings tied on confidence and observation count). Among those, the
 * focus-aligned one is preferred. The rung order never changes, and safety,
 * re-entry and the Reset Plan commitment are exempt structurally. See
 * lib/weekly-review/focus.ts.
 *
 * THE MOVEMENT BLOCK. Every candidate carries an action_type, and any
 * candidate typed 'movement' is dropped and the walk continues. Movement
 * sessions do not exist in this product yet, so such an action would have
 * nothing behind it. The block is structural, not a convention: it is
 * applied to every candidate in one place, before any of them can win.
 */

import {
  APPROACH_AS_WRITTEN,
  APPROACH_REFRAMED,
  APPROACH_SMALLER,
  ESCALATION_REASON_NO_RESPONSE,
  adaptThread,
  threadKeyFor,
} from '../coaching-direction/adaptation';
import { sanitizeSignalEvidence } from '../coaching-direction/evidence';
import { isEmittableActionType } from '../coaching-direction/types';
import type { CoachingActionType, CoachingThreadState } from '../coaching-direction/types';
import { preferWeekFocusWithinRung } from '../weekly-review/focus';
import type { WeekFocus } from '../weekly-review/types';
import type {
  BehavioralFrictionInput,
  ImplicatedDriverInput,
  PriorityInputs,
  PriorityRule,
  SelectedPriority,
} from './types';
import {
  APPROACH_REFRAMED_HELP_TEXT,
  APPROACH_SMALLER_HELP_TEXT,
  RE_ENTRY_HELP_TEXT,
  RE_ENTRY_PRIORITY_TEXT,
  SAFETY_HELP_TEXT,
  SAFETY_PRIORITY_TEXT,
  buildDriverHelp,
  buildDriverReason,
  buildDriverTitle,
  buildFrictionHelp,
  buildFrictionReason,
  buildFrictionTitle,
  buildIncompleteActionHelp,
  buildIncompleteActionReason,
  buildIncompleteActionTitle,
  buildQualifiedPatternHelp,
  buildQualifiedPatternReason,
  buildQualifiedPatternTitle,
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
  frictionHref,
} from './copy';

// ---------------------------------------------------------------------
// Action types, per rule.
// ---------------------------------------------------------------------

/**
 * A driver's domain decides its action type, using the driver library's
 * own domain keys rather than a second mapping table.
 *
 * MOV maps to 'movement' on purpose. It is the one real path by which the
 * blocked type can be produced, and producing it is exactly what makes
 * the block observable: a member whose strongest implicated driver is a
 * movement driver gets the NEXT rule's action, not a movement action, and
 * a test can prove it because the candidate genuinely existed first.
 */
export function driverActionType(domainKey: string): CoachingActionType {
  switch (domainKey) {
    case 'FUE':
    case 'DIG':
      return 'nutrition';
    case 'MOV':
      return 'movement';
    default:
      return 'reflection';
  }
}

/**
 * Exported because the Weekly Root Review's own focus chooser needs to name
 * the same action type this rule would produce for the same friction kind
 * (lib/weekly-review/compose.ts). One owner of the mapping, so a week focus
 * can never point at a kind of action the rule it came from would not emit.
 */
export function frictionActionType(kind: BehavioralFrictionInput['kind']): CoachingActionType {
  switch (kind) {
    case 'daily_reset_incomplete':
      return 'reset';
    case 'food_logging_lapsed':
      return 'nutrition';
    case 'chronic_save_for_later':
      return 'reflection';
  }
}

// ---------------------------------------------------------------------
// Candidates.
// ---------------------------------------------------------------------

/**
 * A candidate is a fully-formed priority that has not yet been chosen.
 * Building all of them before choosing between them is what lets the
 * movement block, the escalation block and the follow-on preference apply
 * uniformly, rather than being re-implemented inside each rule's branch.
 */
type Candidate = SelectedPriority;

function candidate(
  rule: PriorityRule,
  priorityKey: string | null,
  actionType: CoachingActionType,
  parts: { title: string; reason: string | null; help: string; href: string | null },
  evidence: Record<string, unknown>
): Candidate {
  return {
    rule,
    priorityKey,
    title: parts.title,
    reason: parts.reason,
    help: parts.help,
    href: parts.href,
    actionType,
    threadKey: threadKeyFor(rule, priorityKey),
    approach: APPROACH_AS_WRITTEN,
    evidence: sanitizeSignalEvidence({ rule, ...evidence }),
  };
}

/**
 * The overrides, strongest first. Neither is subject to the adaptation
 * guardrails, and both are deliberately exempt:
 *
 *   * Safety must never be suppressed by a counter. A thread that has been
 *     ignored is still a safety thread.
 *   * Re-entry clears itself the moment she engages once, so it cannot
 *     accumulate a streak worth adapting to, and adapting a welcome back
 *     into a "smaller version of a welcome back" would be absurd.
 */
function buildOverrides(inputs: PriorityInputs): Candidate[] {
  const overrides: Candidate[] = [];

  if (inputs.safetyFlag) {
    overrides.push(
      candidate(
        'safety',
        inputs.safetyFlag.safetyClassificationId,
        'reflection',
        {
          title: SAFETY_PRIORITY_TEXT,
          // Never a reason line. The only fact available is what she
          // disclosed, and this card must not repeat it back to her. See
          // copy.ts.
          reason: null,
          help: SAFETY_HELP_TEXT,
          href: null,
        },
        {
          safetyClassificationId: inputs.safetyFlag.safetyClassificationId,
          acknowledgmentPending: true,
        }
      )
    );
  }

  if (inputs.isReEntry) {
    overrides.push(
      candidate(
        're_entry',
        null,
        'reconnect',
        {
          title: RE_ENTRY_PRIORITY_TEXT,
          // Never a reason line. The only fact available is the length of
          // her absence, and naming it is the guilt this whole state
          // exists to avoid. See copy.ts.
          reason: null,
          help: RE_ENTRY_HELP_TEXT,
          href: null,
        },
        {}
      )
    );
  }

  return overrides;
}

/** The ladder's candidates, in PRIORITY_LADDER order. */
function buildLadder(inputs: PriorityInputs, todayLocalDate: string): Candidate[] {
  const ladder: Candidate[] = [];

  if (inputs.resetPlan) {
    const plan = inputs.resetPlan;
    ladder.push(
      candidate(
        'reset_plan_commitment',
        plan.planId,
        'reset',
        {
          title: buildResetPlanTitle(plan),
          reason: buildResetPlanReason(plan),
          help: buildResetPlanHelp(plan),
          href: null,
        },
        { planId: plan.planId, daysLogged: plan.daysLogged, daysSinceStart: plan.daysSinceStart }
      )
    );
  }

  // Rule 2's winner FIRST, then its equally-ranked alternates, all on the
  // same rung. The winner keeps its position: nothing below can outrank
  // anything above, and with no week focus present the walk finds exactly
  // the candidate it always found.
  if (inputs.implicatedDriver) {
    for (const driver of [inputs.implicatedDriver, ...(inputs.implicatedDriverAlternates ?? [])]) {
      const item: ImplicatedDriverInput = driver;
      ladder.push(
        candidate(
          'implicated_driver',
          item.driverId,
          driverActionType(item.domainKey),
          {
            title: buildDriverTitle(item),
            reason: buildDriverReason(item),
            help: buildDriverHelp(item),
            href: null,
          },
          { driverId: item.driverId, driverDomain: item.domainKey }
        )
      );
    }
  }

  if (inputs.qualifiedPattern) {
    for (const pattern of [inputs.qualifiedPattern, ...(inputs.qualifiedPatternAlternates ?? [])]) {
      ladder.push(
        candidate(
          'qualified_pattern',
          pattern.pairKey,
          'reflection',
          {
            title: buildQualifiedPatternTitle(pattern),
            reason: buildQualifiedPatternReason(pattern),
            help: buildQualifiedPatternHelp(),
            href: null,
          },
          {
            pairKey: pattern.pairKey,
            tier: 3,
            confidence: pattern.confidence,
            observationCount: pattern.observationCount,
          }
        )
      );
    }
  }

  if (inputs.incompleteAction) {
    const action = inputs.incompleteAction;
    ladder.push(
      candidate(
        'incomplete_action',
        action.key,
        'reflection',
        {
          title: buildIncompleteActionTitle(action),
          reason: buildIncompleteActionReason(action, todayLocalDate),
          help: buildIncompleteActionHelp(action),
          href: action.href,
        },
        { assessmentKey: action.key }
      )
    );
  }

  if (inputs.behavioralFriction) {
    const friction = inputs.behavioralFriction;
    ladder.push(
      candidate(
        'behavioral_friction',
        friction.kind,
        frictionActionType(friction.kind),
        {
          title: buildFrictionTitle(friction),
          reason: buildFrictionReason(friction),
          help: buildFrictionHelp(friction),
          href: frictionHref(friction),
        },
        {
          frictionKind: friction.kind,
          signalType: friction.signalType,
          starts: friction.starts,
          completions: friction.completions,
          completionRate: friction.completionRate,
          savedCount: friction.savedCount,
          windowDays: friction.windowDays,
          evidenceSufficiency: friction.evidenceSufficiency,
        }
      )
    );
  }

  if (inputs.todaysFocus) {
    const focus = inputs.todaysFocus;
    ladder.push(
      candidate(
        'todays_focus',
        focus.feedItemId,
        'reflection',
        {
          title: buildTodaysFocusTitle(focus),
          reason: buildTodaysFocusReason(focus, inputs.hasRealHistory),
          help: buildTodaysFocusHelp(focus),
          href: null,
        },
        {}
      )
    );
  }

  // The final fallback. Everything above may legitimately come up empty,
  // which is the ordinary state of a brand-new member. Exactly one of
  // these two always applies, so the walk can never come up empty and the
  // pop-up always has something honest to carry.
  //
  // Neither branch makes a claim about her. The first offers the Daily
  // Reset, the product's real core loop; the second quotes her own stated
  // goal back to her.
  if (!inputs.fallback.checkinDoneToday) {
    ladder.push(
      candidate(
        'daily_reset',
        null,
        'reset',
        {
          title: buildDailyResetTitle(),
          reason: buildDailyResetReason(inputs.fallback),
          help: buildDailyResetHelp(),
          href: '/checkin',
        },
        { totalCheckins: inputs.fallback.totalCheckins, checkinDoneToday: false }
      )
    );
  } else {
    ladder.push(
      candidate(
        'gentle_focus',
        null,
        'reflection',
        {
          title: buildGentleFocusTitle(inputs.fallback),
          reason: buildGentleFocusReason(inputs.fallback),
          help: buildGentleFocusHelp(inputs.fallback),
          href: null,
        },
        {
          totalCheckins: inputs.fallback.totalCheckins,
          checkinDoneToday: true,
          hasStatedGoal: inputs.fallback.statedGoalLabel !== null,
        }
      )
    );
  }

  return ladder;
}

// ---------------------------------------------------------------------
// Adaptation.
// ---------------------------------------------------------------------

/** What the service must persist as a result of this decision. */
export type ThreadChange =
  | { threadKey: string; kind: 'approach_change'; approach: number }
  | { threadKey: string; kind: 'escalate'; approach: number; reason: string };

export type AdaptationContext = {
  /** Thread state by thread key, as read from member_coaching_threads. */
  threads: ReadonlyMap<string, CoachingThreadState>;
  /**
   * Yesterday's thread, when she completed it. Null in every other case,
   * including a thread she set aside or ignored: only a completion earns a
   * follow-on.
   */
  completedYesterdayThreadKey: string | null;
  /**
   * This week's focus, from the Weekly Root Review (Part 2), or null.
   *
   * A TIE-BREAKER and nothing more. It can only reorder candidates that sit
   * on the SAME rung of the ladder, it can never move a candidate past one
   * on a higher rung, it can never create a candidate, and it cannot touch
   * safety, re-entry or the Reset Plan commitment. All four of those are
   * properties of lib/weekly-review/focus.ts's own reorder rather than
   * promises made here.
   */
  weekFocus?: WeekFocus | null;
};

export const NO_ADAPTATION: AdaptationContext = {
  threads: new Map(),
  completedYesterdayThreadKey: null,
  weekFocus: null,
};

export type CoachingSelection = {
  selected: SelectedPriority;
  /** Writes the caller must make. Empty on an ordinary day. */
  threadChanges: ThreadChange[];
  /** True when this decision continues something she finished yesterday. */
  isFollowOn: boolean;
};

/**
 * Applies a framing to a candidate.
 *
 * Approach 1 promotes the rule's own smaller step to be the priority,
 * which invents no copy and makes no new claim. Approach 2 keeps the
 * priority and replaces the help with the reframe, and drops the reason
 * line: a reason explains why Root raised this, and at approach 2 the
 * honest answer is that Root is no longer sure it should have.
 */
function applyApproach(item: Candidate, approach: number): Candidate {
  if (approach === APPROACH_SMALLER) {
    return { ...item, title: item.help, help: APPROACH_SMALLER_HELP_TEXT, approach };
  }
  if (approach === APPROACH_REFRAMED) {
    return { ...item, reason: null, help: APPROACH_REFRAMED_HELP_TEXT, approach };
  }
  return { ...item, approach: APPROACH_AS_WRITTEN };
}

/**
 * Reorders the ladder so a thread she finished yesterday, and which is
 * still applicable today, is considered first.
 *
 * This can only ever move a candidate the hierarchy ALREADY admitted. It
 * cannot create one, it cannot resurrect a rule whose inputs are absent,
 * and it is applied to the ladder only, never to the overrides, so safety
 * and re-entry keep their precedence untouched.
 */
function preferFollowOn(ladder: Candidate[], followOnThreadKey: string | null): Candidate[] {
  if (!followOnThreadKey) return ladder;
  const index = ladder.findIndex((item) => item.threadKey === followOnThreadKey);
  if (index <= 0) return ladder;
  const promoted = ladder[index]!;
  return [promoted, ...ladder.filter((_, i) => i !== index)];
}

/**
 * The whole decision, with adaptation. Walks candidates in order and
 * returns the first that survives every block.
 */
export function selectCoachingAction(
  inputs: PriorityInputs,
  todayLocalDate: string,
  adaptation: AdaptationContext = NO_ADAPTATION
): CoachingSelection {
  const overrides = buildOverrides(inputs);
  // Two reorders, in this order, and the order matters.
  //
  // The week focus resolves ties INSIDE a rung; the follow-on preference
  // promotes one candidate ACROSS rungs. Running the focus first means the
  // follow-on rule still sees, and still promotes, exactly the candidate it
  // would have promoted anyway (it matches on thread key, which the
  // within-rung reorder cannot change). Running it second would let a tie
  // resolution undo a promotion the guardrail had already made, which would
  // put a weekly preference above a thing she finished yesterday.
  const ladder = preferFollowOn(
    preferWeekFocusWithinRung(buildLadder(inputs, todayLocalDate), adaptation.weekFocus ?? null),
    adaptation.completedYesterdayThreadKey
  );

  const threadChanges: ThreadChange[] = [];

  // Overrides first, and exempt from every guardrail except the movement
  // block, which is universal. Neither override can ever be typed
  // 'movement', so in practice they always win when present; the filter
  // is applied uniformly anyway rather than special-cased, so there is one
  // place where "no movement action may be emitted" is true.
  for (const item of overrides) {
    if (!isEmittableActionType(item.actionType)) continue;
    return { selected: item, threadChanges, isFollowOn: false };
  }

  for (const item of ladder) {
    if (!isEmittableActionType(item.actionType)) continue;

    const outcome = adaptThread(adaptation.threads.get(item.threadKey) ?? null);

    if (outcome.escalate) {
      threadChanges.push({
        threadKey: item.threadKey,
        kind: 'escalate',
        approach: outcome.approach,
        reason: ESCALATION_REASON_NO_RESPONSE,
      });
      continue;
    }
    if (outcome.blocked) continue;

    if (outcome.changed) {
      threadChanges.push({
        threadKey: item.threadKey,
        kind: 'approach_change',
        approach: outcome.approach,
      });
    }

    return {
      selected: applyApproach(item, outcome.approach),
      threadChanges,
      isFollowOn: item.threadKey === adaptation.completedYesterdayThreadKey,
    };
  }

  // Unreachable for a signed-in member: exactly one fallback half is
  // always built, is always emittable, and has no thread history on the
  // first day it appears. It can only be reached if the fallback thread
  // itself were escalated, which nothing in this build can do, so the
  // final fallback is rebuilt at approach 0 rather than returning null.
  // A card that says something true is always better than no card.
  const rebuilt = buildLadder(inputs, todayLocalDate);
  return {
    selected: rebuilt[rebuilt.length - 1]!,
    threadChanges,
    isFollowOn: false,
  };
}

/**
 * The hierarchy with no adaptation applied. The Priority Card's original
 * entry point, kept exactly as it was so every caller and every existing
 * guard test reads the same function it always did.
 */
export function selectPriority(
  inputs: PriorityInputs,
  todayLocalDate: string
): SelectedPriority {
  return selectCoachingAction(inputs, todayLocalDate, NO_ADAPTATION).selected;
}

/**
 * Which rules COULD have won for these inputs, ignoring precedence and
 * ignoring the movement block. Exists purely so the guard tests can prove
 * a rule's win was a real precedence decision rather than the only option
 * available, which is what makes those tests non-vacuous. Never used by
 * the app itself.
 */
export function applicableRules(inputs: PriorityInputs): PriorityRule[] {
  const rules: PriorityRule[] = [];
  if (inputs.safetyFlag) rules.push('safety');
  if (inputs.isReEntry) rules.push('re_entry');
  if (inputs.resetPlan) rules.push('reset_plan_commitment');
  if (inputs.implicatedDriver) rules.push('implicated_driver');
  if (inputs.qualifiedPattern) rules.push('qualified_pattern');
  if (inputs.incompleteAction) rules.push('incomplete_action');
  if (inputs.behavioralFriction) rules.push('behavioral_friction');
  if (inputs.todaysFocus) rules.push('todays_focus');
  // The fallback always contributes exactly one applicable rule, which is
  // why the ladder can never come up empty. Included here so the guard
  // tests can show the fallback was genuinely available and genuinely lost
  // whenever a real rule won.
  rules.push(inputs.fallback.checkinDoneToday ? 'gentle_focus' : 'daily_reset');
  return rules;
}
