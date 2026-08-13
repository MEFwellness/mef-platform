/**
 * Priority Card, Part 1 — the vocabulary.
 *
 * This module is a DECISION LAYER, not an engine. Everything it selects
 * between was already decided by a system that exists:
 *
 *   rule 0  re_entry              lib/return-greeting/absence.ts (Root Presence)
 *   rule 1  reset_plan_commitment lib/reset-plan/ (migration 142)
 *   rule 2  implicated_driver     lib/driver-state-engine/ + lib/case-view/investigation.ts
 *   rule 3  incomplete_action     lib/assessment-registry/facts.ts + lib/reset-plan/
 *   rule 4  todays_focus          app/actions/coaching-brain.ts (the Coaching Brain)
 *
 * Nothing here computes a correlation, a driver state, a trend, a score,
 * or a content selection. It reads what those systems already published
 * and answers one question they were never asked: of everything true about
 * this member today, which single thing deserves the top of her screen.
 *
 * The Adaptive Coaching Direction build (migration 150) made that decision
 * adaptive and made it remember itself. It still adds no intelligence: the
 * two new signals it reads (an unresolved safety flag, a behavioral
 * friction signal) are both published by systems that already existed, and
 * the adaptation guardrails operate on counters, never on health data.
 */

import type { CoachingActionType, SignalEvidence } from '../coaching-direction/types';
import type { MovementSessionOption } from '../coaching-direction/movement';

/**
 * The selection hierarchy, in its own order. 'safety' and 're_entry' are
 * OVERRIDES rather than ranks: each suspends the ladder rather than
 * sitting at the top of it, which is why the ladder itself is
 * `PRIORITY_LADDER` below and contains neither.
 *
 * The Adaptive Coaching Direction build added three rungs and moved none:
 *
 *   'safety'              an unresolved safety flag from a check-in. The
 *                         strongest override there is. It outranks
 *                         're_entry' and nothing else fires that day.
 *   'qualified_pattern'   a tier 3 correlation finding. The second half of
 *                         "a tier 3 qualified pattern or a Case View
 *                         implicated driver", sitting directly below
 *                         'implicated_driver', which is the first half.
 *   'behavioral_friction' a repeated stuck behavior, read from the
 *                         friction signals service.
 */
export type PriorityRule =
  | 'safety'
  | 're_entry'
  | 'reset_plan_commitment'
  | 'implicated_driver'
  | 'qualified_pattern'
  | 'incomplete_action'
  | 'behavioral_friction'
  | 'todays_focus'
  | 'movement_session'
  | 'daily_reset'
  | 'gentle_focus';

/**
 * The ordered ladder, first match wins. Exported as data so the selection
 * function and its guard tests read the same order rather than each
 * hard-coding it.
 *
 * The last two are the final fallback, added by the pop-up delivery fix.
 * They exist because rules 1 through 4 can all legitimately come up empty
 * — a member with no Reset Plan, no implicated driver, nothing abandoned,
 * and no daily_feed_items row (the real production condition found on two
 * of three test accounts) had no priority at all, so the pop-up would
 * never appear for exactly the member who most needs a first step.
 *
 * They sit last, and their position in THIS array is the only thing that
 * decides precedence, which is what makes "structurally unable to outrank
 * rules 0 through 4" a property of the data rather than a promise in a
 * comment. Exactly one of the two can ever apply: they are the two halves
 * of "has she done today's Daily Reset yet".
 */
export const PRIORITY_LADDER = [
  'reset_plan_commitment',
  'implicated_driver',
  'qualified_pattern',
  'incomplete_action',
  'behavioral_friction',
  'todays_focus',
  'movement_session',
  'daily_reset',
  'gentle_focus',
] as const satisfies readonly PriorityRule[];

/**
 * The ladder as it stood before the movement flip, frozen as data.
 *
 * The flip's whole promise is that it MOVED nothing: 'movement_session' was
 * inserted directly above the final fallback, so every pre-existing rule
 * keeps its exact position relative to every other pre-existing rule.
 * That is a property a test can check byte for byte rather than a claim in
 * a comment, so the old order lives here rather than being retyped inside
 * the test.
 */
export const PRIORITY_LADDER_BEFORE_MOVEMENT = [
  'reset_plan_commitment',
  'implicated_driver',
  'qualified_pattern',
  'incomplete_action',
  'behavioral_friction',
  'todays_focus',
  'daily_reset',
  'gentle_focus',
] as const satisfies readonly PriorityRule[];

/**
 * The overrides, strongest first. Neither is a rank: each returns
 * immediately, so no ladder rule is ever evaluated when one applies.
 * 'safety' outranks 're_entry' because a member who has raised something
 * that has not been resolved should not be met with a welcome back as
 * though nothing had been said.
 */
export const PRIORITY_OVERRIDES = ['safety', 're_entry'] as const satisfies readonly PriorityRule[];

export type PriorityStatus = 'active' | 'done' | 'saved';

/**
 * The safety override's input. Present only when the member has an
 * unresolved safety flag raised by her own check-in.
 *
 * NOTHING about the concern itself is carried here, and that is
 * deliberate rather than an omission. Not the classification level, not
 * the urgency, not the category, not her words. The card's job in this
 * state is to stop asking things of her; it has no business restating what
 * she disclosed, and the outcome ledger has no business remembering it.
 * The only field is the row id, so the coach path can point at the real
 * record.
 *
 * "Unresolved" has one definition, taken from the safety system's own
 * data: a classification from a daily check-in that required a coach
 * review, for which no acknowledgment has been recorded as acknowledged.
 * She resolves it by acknowledging the safety message, which is a real
 * action she can take, so this state cannot get stuck.
 */
export type SafetyFlagInput = {
  safetyClassificationId: string;
};

/**
 * Rule 4's second half: a tier 3 correlation finding.
 *
 * Tier 3 only. The three-tier language module
 * (lib/longitudinal-intelligence/copy.ts) reserves tier 3 for a pattern
 * that has genuinely earned confident wording, and this rule exists to
 * carry exactly that, never a tier 1 "may be worth watching" dressed up as
 * a priority. `memberSentence` is the correlation engine's own member
 * facing sentence, passed through verbatim, never re-worded here.
 */
export type QualifiedPatternInput = {
  pairKey: string;
  /** The candidate pair's own label, e.g. "Bedtime consistency and next-day energy". */
  label: string;
  /** describeSignalForMember's output for this signal. Already tier-appropriate. */
  memberSentence: string;
  confidence: number;
  observationCount: number;
};

/**
 * Rule 5's input. One of three stuck behaviors, each read from a system
 * that already measures it:
 *
 *   'daily_reset_incomplete'  the friction signals service's
 *                             repeated_incomplete_flow signal on the
 *                             daily_reset flow.
 *   'food_logging_lapsed'     its feature_use_declined /
 *                             opened_once_not_revisited signal on food
 *                             logging.
 *   'chronic_save_for_later'  the card's own member_daily_priorities
 *                             history. No analytics call at all: "she has
 *                             set the last several priorities aside" is a
 *                             fact about this feature, recorded by this
 *                             feature.
 *
 * The metrics are carried so the reason line can be query-backed. Nothing
 * here is health content: every value is a count, a rate or a slug.
 */
export type BehavioralFrictionKind =
  | 'daily_reset_incomplete'
  | 'food_logging_lapsed'
  | 'chronic_save_for_later';

export type BehavioralFrictionInput = {
  kind: BehavioralFrictionKind;
  /** The friction signals service's own signal type, for the ledger. Null for the save-for-later kind, which that service cannot see. */
  signalType: string | null;
  /** Counts behind the signal. Present only where the source really produced them. */
  starts: number | null;
  completions: number | null;
  completionRate: number | null;
  savedCount: number | null;
  windowDays: number | null;
  /** The friction service's own evidence sufficiency, or null for the save-for-later kind. */
  evidenceSufficiency: string | null;
};

/**
 * Rule 1's input. Present only when the member has an ACTIVE plan (never a
 * draft) whose daily action has no logged state for today, which is
 * exactly the "commitment she has not completed today" the brief names.
 */
export type ResetPlanCommitmentInput = {
  planId: string;
  planVersionId: string;
  /** The plan's own agreed action text, verbatim from lib/reset-plan/actionLibrary.ts. Never re-worded here. */
  actionText: string;
  /** The same action's difficult-day version, which is already this product's established "easiest smaller step". */
  difficultDayText: string;
  /** Real counts from member_reset_plan_daily_logs, for the reason line. */
  daysLogged: number;
  daysSinceStart: number;
};

/**
 * Rule 2's input. Only ever built from a driver whose state is
 * 'implicated' and which is relevant to her stated goals, both of which
 * are decided upstream by lib/case-view/investigation.ts's
 * `likelyInvolved` bucket. 'watching' can never reach here.
 */
export type ImplicatedDriverInput = {
  driverId: string;
  /**
   * The driver library's own domain key (SLP, FUE, DIG, MOV, MEC, STR,
   * CTX). Decides the action_type, which is what makes the movement block
   * real: a driver in the MOV domain would produce a movement action, and
   * the engine drops it and carries on down the ladder rather than
   * emitting one.
   */
  domainKey: string;
  /** e.g. "Bedtime consistency" — the driver library's own label. */
  label: string;
  /** e.g. "How much bedtime varies night to night" — the library's own description. */
  whatItObserves: string;
  /**
   * The correlation engine's own member-facing sentence for the finding
   * that implicated this driver, or null when the implicating finding is
   * not one of her goal-relevant earned findings. Null means the card
   * shows no reason line rather than inventing one.
   */
  findingSentence: string | null;
};

/**
 * Rule 3's input. An assessment or experience she genuinely started and
 * left, read from the systems that already track that: the assessment
 * registry's own 'in_progress' completion status, or a Reset Plan still
 * sitting in 'draft'.
 */
export type IncompleteActionInput = {
  /** Registry assessment key, or 'personal-reset-plan' for an abandoned plan draft. */
  key: string;
  name: string;
  /** Where to send her to pick it up. */
  href: string;
  /** The first, smallest thing waiting for her there, for "Help me". */
  resumeHint: string;
  /** Her own local date she last touched it, for the reason line. Null when the source has no honest timestamp. */
  lastTouchedLocalDate: string | null;
};

/**
 * The final fallback's input. Always present for a signed-in member, which
 * is what guarantees the hierarchy can never come up empty and the pop-up
 * always has something honest to say.
 *
 * Nothing here is derived or interpreted. `checkinDoneToday` is a fact,
 * `totalCheckins` is a count, and `statedGoalLabel` is her own onboarding
 * selection quoted back. A member at this point in the product has
 * produced nothing to have an insight about, so the copy built from this
 * makes no claim about her.
 */
export type DailyResetFallbackInput = {
  checkinDoneToday: boolean;
  /** All-time completed check-ins. Used only to decide whether an honest count exists to mention at all. */
  totalCheckins: number;
  /** Her own stated onboarding goal, verbatim from the WELCOME_GOALS label, or null if she never selected one. */
  statedGoalLabel: string | null;
};

/**
 * Everything the engine needs to know about Root Movement, read from the
 * systems that already own it. Null when there is nothing to read: before
 * migration 153 reaches an environment, when the templates read fails, or
 * when every template has been retired. A null here leaves the whole engine
 * byte-identical to the build before the movement flip, which is what lets
 * this degrade to "no movement is ever offered" rather than to an error.
 *
 * NOTHING HERE IS A JUDGEMENT. The sessions are the six rows migration 153
 * seeded, the completion dates are her own runs, and the coach flag is a
 * scheduled row's existence. The engine does no scoring over any of it.
 */
export type MovementInput = {
  /**
   * The live templates, each with her own last completion of it. Only
   * `is_active` templates ever appear, so a retired session can neither be
   * mapped to nor fall out of the fallback rotation.
   */
  sessions: readonly MovementSessionOption[];
  /**
   * True when a coach has a workout scheduled for her TODAY that she has
   * not finished (coach_assigned_workouts, migration 82).
   *
   * When it is true no movement priority is built at all, on any rung. A
   * coach's own programming is the plan she agreed to with a person; Root
   * offering a different session on the same day would either displace it
   * or quietly compete with it, and neither is Root's to do. Every other
   * rule is untouched by this flag, so she still gets an ordinary priority.
   */
  coachAssignedToday: boolean;
};

/** Rule 4's input — the Coaching Brain's already-selected focus for today. */
export type TodaysFocusInput = {
  feedItemId: string;
  focusText: string;
  /**
   * The Coaching Brain's own reason for today's selection. Passed through
   * only when it is genuinely backed by this member's history: see
   * `hasRealHistory` below, which is what stops a brand-new member being
   * shown a reason line about patterns she has not produced yet.
   */
  reasonText: string | null;
  /** The lesson's own suggested action, already sized as the smaller step. */
  suggestedAction: string | null;
};

/**
 * Everything the pure selection function needs. Every field is filled by
 * lib/priority/service.ts from an existing system's published output, and
 * every one may legitimately be null.
 */
export type PriorityInputs = {
  /**
   * The strongest override. Non-null only when an unresolved safety flag
   * from a check-in exists. When it is set, nothing else fires that day.
   */
  safetyFlag?: SafetyFlagInput | null;
  /** From lib/return-greeting/absence.ts's classifyPresence — the one absence ladder. */
  isReEntry: boolean;
  resetPlan: ResetPlanCommitmentInput | null;
  implicatedDriver: ImplicatedDriverInput | null;
  /** Rule 4's second half. Only ever a tier 3 finding; see the type. */
  qualifiedPattern?: QualifiedPatternInput | null;
  /**
   * Other drivers in the SAME `likelyInvolved` bucket, equally ranked by
   * Case View's own panel.
   *
   * Added by the Weekly Root Review (Part 2) and read by NOTHING except its
   * within-rung tie-break. `implicatedDriver` above is still rule 2's own
   * winner, chosen exactly as it always was; these are the candidates that
   * were tied with it and lost to array order. See
   * lib/weekly-review/focus.ts for why a same-rung tie is the only place a
   * week focus is allowed to act.
   */
  implicatedDriverAlternates?: readonly ImplicatedDriverInput[];
  /** Rule 3's equally-ranked alternates: tier 3 findings tied with the winner on confidence AND observation count. Same contract as above. */
  qualifiedPatternAlternates?: readonly QualifiedPatternInput[];
  incompleteAction: IncompleteActionInput | null;
  /**
   * Rule 5. Optional because it is loaded LAZILY: the friction signals
   * service is several queries, and there is no reason to run them on a
   * day a higher rule was always going to win. See lib/priority/service.ts
   * for the two-pass load.
   */
  behavioralFriction?: BehavioralFrictionInput | null;
  todaysFocus: TodaysFocusInput | null;
  /**
   * Root Movement, or null when there is nothing to read. Optional so every
   * existing caller and every existing fixture compiles and behaves exactly
   * as it did. See MovementInput above.
   */
  movement?: MovementInput | null;
  /**
   * The final fallback. Non-nullable on purpose: this is the field that
   * makes `selectPriority` total for a signed-in member, so the pop-up
   * always has a priority to carry.
   */
  fallback: DailyResetFallbackInput;
  /**
   * Whether this member has any completed check-in history at all. Gates
   * the reason line on rule 4 only: the Coaching Brain always produces a
   * reason string, but for a member on her first day that string describes
   * a starting posture rather than an observation of her, and the brief is
   * explicit that a first-day member gets a sensible focus with no
   * fabricated insight.
   */
  hasRealHistory: boolean;
};

/**
 * The one winner. `reason` is null whenever no honest, query-backed reason
 * exists, which the card renders as no reason line at all rather than
 * filler.
 */
export type SelectedPriority = {
  rule: PriorityRule;
  /** Identifies what specifically won, for the stored row and analytics. Null for re-entry, which is not about any one item. */
  priorityKey: string | null;
  /** The priority itself. */
  title: string;
  /** One short observational line, from her real data. Null when there isn't one. */
  reason: string | null;
  /** The easiest smaller next step, revealed in place by "Help me". Never a navigation. */
  help: string;
  /** Optional deep link the card offers alongside the buttons (e.g. resume an abandoned assessment). */
  href: string | null;
  /**
   * What KIND of thing this action asks for. Never rendered — it exists so
   * the outcome ledger and a later grading pass can compare kinds of
   * action without reading any individual action's words.
   */
  actionType: CoachingActionType;
  /** '<rule>::<priority key>'. The thread this decision belongs to, across days. */
  threadKey: string;
  /** Which framing this is: as written, its smaller step, or the reframe. */
  approach: number;
  /** Signal keys and metrics only, already sanitized. Never health content. */
  evidence: SignalEvidence;
};

/**
 * Today's stored row, if the member already has one. Authoritative for
 * what Root actually showed her today: the winning rule legitimately
 * changes during the day (completing a Reset Plan commitment makes rule 1
 * stop applying), so re-running the hierarchy is not a safe way to
 * reconstruct what she was looking at. `reason` is deliberately absent
 * here and always regenerated live. See migration 147's own header.
 */
export type DailyPriorityRecord = {
  id: string;
  localDate: string;
  rule: PriorityRule;
  priorityKey: string | null;
  title: string;
  help: string;
  href: string | null;
  status: PriorityStatus;
  doneAt: string | null;
  savedAt: string | null;
  /**
   * When the card genuinely reached her, claimed atomically by migration
   * 148's own `shown_at is null` update. Null means she never saw it.
   *
   * Read by the outcome ledger, and it is the whole difference between
   * 'ignored' and 'not_seen'. Those are not two words for the same thing:
   * one is a member declining a suggestion, the other is a member who was
   * not in the app, and the adaptation guardrails must never treat the
   * second as the first.
   */
  shownAt: string | null;
};

/**
 * The adaptation moment, when there is one: yesterday's completed
 * priority, shown briefly in its resolved state before today's takes
 * over. Purely a presentation fact — see lib/priority/transition.ts for
 * the three conditions that produce it, none of which can influence
 * which priority won today.
 */
export type PriorityBridge = {
  /** Yesterday's priority, exactly as she was shown it. */
  yesterdayTitle: string;
};

/** What the Today page renders. */
export type PriorityView = {
  selected: SelectedPriority;
  status: PriorityStatus;
  /** Her own local date for this priority. Scopes the once-per-day bridge replay guard. */
  localDate: string;
  /**
   * Non-null only when Root visibly adapted overnight: she completed
   * yesterday's priority and today's is a different one. Null is the
   * ordinary case and means the ordinary entrance plays.
   */
  bridge: PriorityBridge | null;
  /** True when rule 0 fired, so the card shows the welcome-back opening. */
  isReEntry: boolean;
  /**
   * Root's single established return sentence, shown on a re-entry
   * opening. Always lib/return-greeting/copy.ts's RETURN_GREETING_TEXT,
   * never a second welcome authored here.
   */
  welcomeLine: string | null;
};
