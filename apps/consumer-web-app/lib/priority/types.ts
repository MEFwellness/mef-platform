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
 */

/**
 * The selection hierarchy, in its own order. 're_entry' is an override
 * rather than a rank: it suspends the ladder rather than sitting at the
 * top of it, which is why the ladder itself is `PRIORITY_LADDER` below and
 * does not contain it.
 */
export type PriorityRule =
  | 're_entry'
  | 'reset_plan_commitment'
  | 'implicated_driver'
  | 'incomplete_action'
  | 'todays_focus';

/**
 * The ordered ladder rules 1 through 4, first match wins. Exported as data
 * so the selection function and its guard tests read the same order rather
 * than each hard-coding it.
 */
export const PRIORITY_LADDER = [
  'reset_plan_commitment',
  'implicated_driver',
  'incomplete_action',
  'todays_focus',
] as const satisfies readonly PriorityRule[];

export type PriorityStatus = 'active' | 'done' | 'saved';

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
  /** From lib/return-greeting/absence.ts's classifyPresence — the one absence ladder. */
  isReEntry: boolean;
  resetPlan: ResetPlanCommitmentInput | null;
  implicatedDriver: ImplicatedDriverInput | null;
  incompleteAction: IncompleteActionInput | null;
  todaysFocus: TodaysFocusInput | null;
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
};

/** What the Today page renders. */
export type PriorityView = {
  selected: SelectedPriority;
  status: PriorityStatus;
  /** True when rule 0 fired, so the card shows the welcome-back opening. */
  isReEntry: boolean;
  /**
   * Root's single established return sentence, shown on a re-entry
   * opening. Always lib/return-greeting/copy.ts's RETURN_GREETING_TEXT,
   * never a second welcome authored here.
   */
  welcomeLine: string | null;
};
