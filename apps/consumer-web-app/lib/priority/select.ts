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
 *   7  movement_session       A Root Movement session, offered ONLY when
 *                             the Daily Reset is already done. See the
 *                             movement flip note at the bottom of this
 *                             header.
 *   8/9 daily_reset / gentle_focus  The final fallback, unchanged.
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
 * THE GRADE PREFERENCE (Part 3). `selectCoachingAction` optionally receives
 * this member's approach grades and uses them as a PREFERENCE INSIDE each
 * rung: when a rung produced several candidates, the kinds of action she
 * has evidence of acting on come first and the kinds graded dead for her
 * come last. It has exactly the same two properties as the week focus
 * reorder (the sequence of rules is unchanged, and with no grades the array
 * is unchanged), it removes nothing, and it cannot reach safety, re-entry
 * or the commitment. See lib/coaching-direction/preference.ts.
 *
 * THE MOVEMENT FLIP. The block that used to drop every candidate typed
 * 'movement' is gone, because the six Root Movement sessions now exist
 * (migrations 153 and 154). What replaced it is narrower and stricter, and
 * it is applied in the same one place to every candidate: A MOVEMENT ACTION
 * MUST CARRY A LIVE SESSION KEY. A movement candidate with nothing behind
 * it is dropped and the walk continues, exactly as the whole type was
 * before, so the invariant the old block protected still holds.
 *
 * Movement can be reached by exactly TWO paths and no others:
 *
 *   1. The implicated-driver rung, when the winning driver is one the
 *      mapping table in lib/coaching-direction/movement.ts names. The rung
 *      does not move, the driver still had to be implicated AND
 *      goal-relevant, and the action becomes that driver's one mapped
 *      session.
 *   2. The 'movement_session' rung, which is built ONLY when today's Daily
 *      Reset is already complete. It sits directly above the final
 *      fallback, so it can never outrank anything that used to win, and
 *      when the Daily Reset is NOT done it does not exist at all and the
 *      reset fallback is reached exactly as before.
 *
 * Safety, re-entry, the Reset Plan commitment, the qualified-pattern rung,
 * the incomplete-action rung and the friction rung cannot produce a
 * movement action: none of them is domain-typed and none is given a session.
 * A coach-assigned workout scheduled for today suppresses both paths.
 */

import {
  APPROACH_AS_WRITTEN,
  APPROACH_REFRAMED,
  APPROACH_SMALLER,
  ESCALATION_REASON_NO_RESPONSE,
  adaptThread,
  threadKeyFor,
} from '../coaching-direction/adaptation';
import {
  isFrictionQuestionOpen,
  approachAfterFriction,
  shouldAskFriction,
  NO_FRICTION_STATE,
  type ThreadFrictionState,
} from '../coaching-direction/friction';
import { sanitizeSignalEvidence } from '../coaching-direction/evidence';
import { preferGradedActionTypesWithinRung } from '../coaching-direction/preference';
import type { CoachingGrade } from '../coaching-direction/grading';
import { isEmittableActionType } from '../coaching-direction/types';
import type { CoachingActionType, CoachingThreadState } from '../coaching-direction/types';
import {
  isMovementSessionKey,
  movementSessionForDriver,
  movementSessionHref,
  selectFallbackMovementSession,
} from '../coaching-direction/movement';
import type { MovementSessionKey } from '../coaching-direction/movement';
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
  buildMovementDriverHelp,
  buildMovementDriverTitle,
  buildMovementFallbackHelp,
  buildMovementFallbackReason,
  buildMovementFallbackTitle,
  frictionHref,
} from './copy';

// ---------------------------------------------------------------------
// Action types, per rule.
// ---------------------------------------------------------------------

/**
 * A driver's domain decides its action type, using the driver library's
 * own domain keys rather than a second mapping table.
 *
 * UNCHANGED by the movement flip, deliberately. MOV still maps to
 * 'movement' whether or not that driver has a session behind it, so a MOV
 * driver the mapping table does not name still produces a movement
 * candidate with no session, and the universal session-key guard still
 * drops it and walks on. That is exactly what the old block did for every
 * MOV driver, and keeping it means the flip changed the behavior of the
 * mapped drivers only.
 *
 * MEC is not named here and still falls through to 'reflection'. A MEC
 * driver becomes a movement action through the mapping table below, not
 * through its domain.
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
 * The action type for one implicated driver, once the mapping table has
 * had its say.
 *
 * A driver the table names is a movement action regardless of its domain,
 * which is how the posture drivers (MEC) reach a session at all. Every
 * other driver keeps exactly the type `driverActionType` always gave it.
 */
function driverCandidateActionType(
  driver: ImplicatedDriverInput,
  sessionKey: MovementSessionKey | null
): CoachingActionType {
  return sessionKey ? 'movement' : driverActionType(driver.domainKey);
}

/**
 * The one place that decides whether a candidate has a real session behind
 * it. A movement action must carry a session key in its evidence; every
 * other action type is unaffected.
 *
 * This is the structural replacement for the movement block, and it is
 * applied to every candidate in the same loop the block occupied, so
 * "Root never offers a movement action with nothing behind it" is a
 * property of the walk rather than of any one rule.
 */
function hasSessionBehindIt(item: Candidate): boolean {
  if (item.actionType !== 'movement') return true;
  return isMovementSessionKey(item.evidence.sessionKey);
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

/**
 * Which Root Movement sessions the engine may offer at all today.
 *
 * Empty in three cases, and all three mean the same thing to every caller
 * below: no movement candidate is built anywhere, on any rung.
 *   * no movement input at all (before migration 153, or a failed read),
 *   * no live templates,
 *   * a coach has a workout scheduled for her today that is not finished.
 */
function movementOptions(inputs: PriorityInputs) {
  const movement = inputs.movement;
  if (!movement || movement.coachAssignedToday) return [];
  return movement.sessions;
}

/** The ladder's candidates, in PRIORITY_LADDER order. */
function buildLadder(inputs: PriorityInputs, todayLocalDate: string): Candidate[] {
  const ladder: Candidate[] = [];
  const sessions = movementOptions(inputs);
  const liveSessionKeys = new Set(sessions.map((session) => session.sessionKey));
  const sessionNameByKey = new Map(sessions.map((session) => [session.sessionKey, session.name]));

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
      // The mapping table, applied to a candidate the rung already admitted.
      // It changes what this driver ASKS FOR; it can neither create a
      // candidate nor move one, so the rung is untouched.
      const sessionKey = movementSessionForDriver(item.driverId, liveSessionKeys);
      const sessionName = sessionKey ? sessionNameByKey.get(sessionKey) : undefined;
      const isMovement = sessionKey !== null && sessionName !== undefined;

      ladder.push(
        candidate(
          'implicated_driver',
          item.driverId,
          driverCandidateActionType(item, isMovement ? sessionKey : null),
          {
            title: isMovement ? buildMovementDriverTitle(item, sessionName!) : buildDriverTitle(item),
            // The finding sentence either way. A movement priority earns its
            // reason line on exactly the evidence a noticing one does, and
            // shows none when that sentence does not exist.
            reason: buildDriverReason(item),
            help: isMovement ? buildMovementDriverHelp(sessionName!) : buildDriverHelp(item),
            href: isMovement ? movementSessionHref(sessionKey!) : null,
          },
          {
            driverId: item.driverId,
            driverDomain: item.domainKey,
            ...(isMovement ? { sessionKey } : {}),
          }
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

  // The enriched fallback. Root Movement, offered ONLY when today's Daily
  // Reset is already done, and only above the goal fallback.
  //
  // The condition is the whole safety of this rung. When the Daily Reset is
  // not done, this candidate is not built at all, the daily_reset half below
  // is, and a member who has not checked in still gets the reset exactly as
  // she always did. When it IS done, the member has already given Root
  // everything Root asks of her today, and the alternative on this rung is a
  // sentence that quotes her own goal back at her. Offering a session she
  // can open is a better use of that slot, and it still makes no claim about
  // her.
  //
  // The choice is the least-recently-completed session, ties broken by the
  // seeded order. No scoring, no personalization: this rung is reached
  // precisely because nothing above it had anything to say.
  const fallbackSession = inputs.fallback.checkinDoneToday
    ? selectFallbackMovementSession(sessions)
    : null;

  if (fallbackSession) {
    ladder.push(
      candidate(
        'movement_session',
        fallbackSession.sessionKey,
        'movement',
        {
          title: buildMovementFallbackTitle(fallbackSession.name),
          reason: buildMovementFallbackReason(),
          help: buildMovementFallbackHelp(fallbackSession.name),
          href: movementSessionHref(fallbackSession.sessionKey),
        },
        { sessionKey: fallbackSession.sessionKey, checkinDoneToday: true }
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
  | {
      threadKey: string;
      kind: 'escalate';
      approach: number;
      reason: string;
      /**
       * What KIND of action this thread was, carried so the Part 3
       * escalation event can say so without the service having to look the
       * thread back up. A fixed slug; never the action's own wording.
       */
      actionType: CoachingActionType;
    };

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
  /**
   * This member's approach grades, keyed by ACTION TYPE (Part 3).
   *
   * A preference INSIDE a rung and nothing more. It can only reorder
   * candidates that share a rule, it can never move one past a candidate on
   * a higher rung, it never removes a candidate, and it cannot touch
   * safety, re-entry or the Reset Plan commitment. All four are properties
   * of lib/coaching-direction/preference.ts's own reorder rather than
   * promises made here.
   *
   * An empty map leaves the engine byte-identical to Part 2.
   */
  grades?: ReadonlyMap<string, CoachingGrade>;
  /**
   * What the member has already told Root got in the way, per thread
   * (AUDIT-ADAPTIVE-REVEAL.md 2.17).
   *
   * Read INSIDE a rung and nothing more: it can only change which FRAMING a
   * candidate the ladder already admitted is offered in. It cannot create a
   * candidate, cannot remove one, cannot reorder the ladder, and cannot
   * touch safety, re-entry or the Reset Plan commitment, because it is only
   * consulted at the point `adaptThread` had already decided to change the
   * approach.
   *
   * An empty map leaves the engine byte-identical to the build before the
   * friction question existed.
   */
  friction?: ReadonlyMap<string, ThreadFrictionState>;
  /**
   * Whether the friction question can be RECORDED at all, i.e. whether
   * migration 166 has landed.
   *
   * False makes the whole feature dormant. Asking a member what got in the
   * way and then being unable to store her answer is worse than not asking,
   * so when this is false the engine never asks and behaves exactly as it
   * did before.
   */
  frictionAvailable?: boolean;
};

export const NO_ADAPTATION: AdaptationContext = {
  threads: new Map(),
  completedYesterdayThreadKey: null,
  weekFocus: null,
  grades: new Map(),
  friction: new Map(),
  frictionAvailable: false,
};

export type CoachingSelection = {
  selected: SelectedPriority;
  /** Writes the caller must make. Empty on an ordinary day. */
  threadChanges: ThreadChange[];
  /** True when this decision continues something she finished yesterday. */
  isFollowOn: boolean;
  /**
   * Non-null on the one run where Root should ask what got in the way,
   * instead of rewording or escalating (AUDIT-ADAPTIVE-REVEAL.md 2.17).
   *
   * The card renders the question; the caller records that it was asked.
   * Exactly one thread can be in this state at a time, because exactly one
   * candidate is ever selected.
   */
  askFriction: { threadKey: string } | null;
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
  // THREE reorders, in this order, and the order is the whole design.
  //
  // Two of them resolve order INSIDE a rung (the Part 3 grade preference
  // and the Part 2 week focus); the third promotes one candidate ACROSS
  // rungs (the follow-on guardrail). The across-rungs one runs LAST, so a
  // tie resolution can never undo a promotion the guardrail already made,
  // which would put a preference above a thing she finished yesterday. It
  // is unaffected by either within-rung pass: it matches on thread key,
  // which neither reorder can change.
  //
  // Between the two within-rung passes, the GRADES run first and the WEEK
  // FOCUS second, so the focus wins wherever they disagree. A grade is a
  // ninety day aggregate; the focus is a fresh decision Root made about
  // this specific week from her own week's data, which is both more recent
  // and more specific. Running the grades second would also silently change
  // every tie Part 2 already decides, which Part 2's own tests assert.
  const ladder = preferFollowOn(
    preferWeekFocusWithinRung(
      preferGradedActionTypesWithinRung(
        buildLadder(inputs, todayLocalDate),
        adaptation.grades ?? new Map(),
        todayLocalDate
      ),
      adaptation.weekFocus ?? null
    ),
    adaptation.completedYesterdayThreadKey
  );

  const threadChanges: ThreadChange[] = [];

  // Overrides first, and exempt from every guardrail except the two
  // universal filters. Neither override can ever be typed 'movement'
  // (safety is 'reflection', re-entry is 'reconnect', and neither is given
  // a session), so in practice they always win when present; the filters
  // are applied uniformly anyway rather than special-cased, so there is one
  // place where "no action may be emitted with nothing behind it" is true.
  for (const item of overrides) {
    if (!isEmittableActionType(item.actionType)) continue;
    if (!hasSessionBehindIt(item)) continue;
    return { selected: item, threadChanges, isFollowOn: false, askFriction: null };
  }

  for (const item of ladder) {
    if (!isEmittableActionType(item.actionType)) continue;
    if (!hasSessionBehindIt(item)) continue;

    const thread = adaptation.threads.get(item.threadKey) ?? null;
    const outcome = adaptThread(thread, todayLocalDate);
    const friction = adaptation.friction?.get(item.threadKey) ?? NO_FRICTION_STATE;

    // ROOT ASKS BEFORE IT ADAPTS (AUDIT-ADAPTIVE-REVEAL.md 2.17).
    //
    // The ignore window has closed. Before this existed, that meant the
    // approach silently changed, and two silent changes later the thread
    // went to a coach and stopped being offered, with the member never once
    // asked why. She is asked now, and the reword waits a day for her
    // answer.
    //
    // Placed above BOTH branches on purpose: the rule is "before the engine
    // rewords the approach or escalates", so an escalation is delayed by the
    // same one day the reword is. Once per thread, ever: shouldAskFriction is
    // false the moment she has been asked, whether or not she answered, so a
    // member who ignores the question is never nagged with it again and the
    // ordinary silent behaviour resumes on the next run.
    //
    // Gated on frictionAvailable, which is false until migration 166 has
    // landed. Asking a question whose answer cannot be stored is worse than
    // not asking.
    if (
      (outcome.changed || outcome.escalate) &&
      adaptation.frictionAvailable === true &&
      shouldAskFriction({ wouldChangeApproach: true, friction })
    ) {
      return {
        // Unchanged framing. The card she is looking at is the one the
        // question is about, so it must not change out from under the
        // question being asked about it.
        selected: applyApproach(item, thread?.approach ?? APPROACH_AS_WRITTEN),
        threadChanges,
        isFollowOn: item.threadKey === adaptation.completedYesterdayThreadKey,
        askFriction: { threadKey: item.threadKey },
      };
    }

    if (outcome.escalate) {
      threadChanges.push({
        threadKey: item.threadKey,
        kind: 'escalate',
        approach: outcome.approach,
        reason: ESCALATION_REASON_NO_RESPONSE,
        actionType: item.actionType,
      });
      continue;
    }
    if (outcome.blocked) continue;

    // Her answer decides WHICH framing, where the engine used to walk a
    // fixed order. Silence, whether she was never asked or was asked and did
    // not reply, falls back to exactly the order it always used.
    const approach = outcome.changed
      ? approachAfterFriction(friction, outcome.approach, thread?.approach ?? APPROACH_AS_WRITTEN)
      : outcome.approach;

    if (outcome.changed) {
      threadChanges.push({
        threadKey: item.threadKey,
        kind: 'approach_change',
        approach,
      });
    }

    return {
      selected: applyApproach(item, approach),
      threadChanges,
      isFollowOn: item.threadKey === adaptation.completedYesterdayThreadKey,
      // The question stays on the card for the rest of the day she was asked
      // on, so a member who reloads Home does not lose it.
      askFriction: isFrictionQuestionOpen(friction, todayLocalDate)
        ? { threadKey: item.threadKey }
        : null,
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
    askFriction: null,
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
 * ignoring the session-key guard. Exists purely so the guard tests can
 * prove a rule's win was a real precedence decision rather than the only
 * option available, which is what makes those tests non-vacuous. Never used
 * by the app itself.
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
  // Applicable only when today's Daily Reset is already done AND a session
  // survived the coach-assignment and live-template checks, which is the
  // whole condition the enriched fallback runs on.
  if (inputs.fallback.checkinDoneToday && selectFallbackMovementSession(movementOptions(inputs))) {
    rules.push('movement_session');
  }
  // The fallback always contributes exactly one applicable rule, which is
  // why the ladder can never come up empty. Included here so the guard
  // tests can show the fallback was genuinely available and genuinely lost
  // whenever a real rule won.
  rules.push(inputs.fallback.checkinDoneToday ? 'gentle_focus' : 'daily_reset');
  return rules;
}
