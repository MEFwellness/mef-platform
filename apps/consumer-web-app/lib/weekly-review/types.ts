/**
 * The Weekly Root Review — the vocabulary.
 *
 * Part 2 of Adaptive Coaching Direction. Once a week Root says what the
 * week showed, what worked, and what it is adjusting, then sets one focus
 * for the coming week that biases Part 1's daily decision engine.
 *
 * This module computes no correlation, no driver state, no trend, no tier,
 * no score and no content. Every observation it can make is a READ of a
 * conclusion another system already published, and the language tier it is
 * allowed to say it at is that system's own tier, never one decided here.
 *
 * THE ONE STRUCTURAL RULE OF THIS FEATURE. A review row stores a PLAN, not
 * prose: which observation kinds were earned, at which tier, with which
 * signal keys and which numbers. ./copy.ts renders the words from the plan
 * at read time, deterministically, so the member reads the same review all
 * week and not one member-facing sentence is ever persisted. See
 * ./plan.ts for the sanitizer that makes it true at runtime.
 */

import type { CoachingActionType } from '../coaching-direction/types';

// ---------------------------------------------------------------------
// Observations — "WHAT THIS WEEK SHOWED".
// ---------------------------------------------------------------------

/**
 * The closed set of things Root can observe about a week.
 *
 * Every one of these is renderable from keys and numbers alone, which is
 * what lets the plan carry no prose. That constraint is the reason a
 * driver label and a correlation pair label are deliberately NOT in this
 * vocabulary: resolving either would mean a database read at render time,
 * or storing the label, and a stored label is one step from a stored
 * sentence.
 *
 *   reset_consistency   Daily Resets logged this week against last week.
 *   metric_direction    A member_pattern_states direction for one Daily
 *                       Wellness Index metric, said at that row's own tier
 *                       through the three-tier language module itself.
 *   pattern_conflicting The same module's 'conflicting' state: two signals
 *                       in one domain pointing opposite ways.
 *   plan_week           The Reset Plan's own weekly classification of this
 *                       week's daily logs.
 *   friction            A friction signal from the analytics service layer.
 *   action_engagement   What the Part 1 outcome ledger recorded about the
 *                       actions Root delivered this week.
 */
export const OBSERVATION_KINDS = [
  'reset_consistency',
  'metric_direction',
  'pattern_conflicting',
  'plan_week',
  'friction',
  'action_engagement',
] as const;

export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

export function isObservationKind(value: unknown): value is ObservationKind {
  return typeof value === 'string' && (OBSERVATION_KINDS as readonly string[]).includes(value);
}

/**
 * One earned observation, as stored and as rendered.
 *
 * `tier` is the LANGUAGE tier, and it is copied from the system that
 * published the signal, never computed here. Null means the source
 * declined to assign one, which the three-tier language module reserves
 * for its three fixed-phrase states ('stale', 'conflicting',
 * 'insufficient_data'). An observation with a null tier may only ever be
 * rendered with that module's own fixed hedged phrasing.
 *
 * `state` is a slug from whichever vocabulary the source owns (a
 * SignalState, a ResetPlanDay7Pattern, a BehavioralFrictionKind). Never a
 * sentence.
 *
 * `metrics` is numbers only. ./plan.ts enforces both at runtime.
 */
export type ReviewObservation = {
  kind: ObservationKind;
  tier: 1 | 2 | 3 | null;
  /** The publishing system's own key for this signal, or null where it has none (a pure count). */
  signalKey: string | null;
  /** A slug from the source's own vocabulary, or null. */
  state: string | null;
  metrics: Record<string, number>;
};

// ---------------------------------------------------------------------
// What worked.
// ---------------------------------------------------------------------

/**
 * "WHAT WORKED" is the strictest section in the feature, because it is the
 * only one that makes a positive claim. It may therefore only ever be
 * built from something the ledger or a daily log RECORDED, never from an
 * inference:
 *
 *   acted_on_actions  member_coaching_decisions rows this week whose
 *                     member_response is 'done' or 'help'. Both count: the
 *                     smaller step is the action working, not failing.
 *   plan_returns      member_reset_plan_daily_logs rows this week in
 *                     either completed state.
 *   reset_days        daily_checkins rows this week.
 *
 * When none of the three has anything in it, the section is ABSENT. Root
 * does not congratulate a member on a week she did not have.
 */
export const WORKED_KINDS = ['acted_on_actions', 'plan_returns', 'reset_days'] as const;

export type WorkedKind = (typeof WORKED_KINDS)[number];

export function isWorkedKind(value: unknown): value is WorkedKind {
  return typeof value === 'string' && (WORKED_KINDS as readonly string[]).includes(value);
}

export type ReviewWorked = {
  kind: WorkedKind;
  /** The action type these were, when every counted row shared one. Null when they were mixed or when the kind has no action type. */
  actionType: CoachingActionType | null;
  metrics: Record<string, number>;
};

// ---------------------------------------------------------------------
// The coming week's focus.
// ---------------------------------------------------------------------

/**
 * Why Root chose this focus. A closed set of slugs, each of which ./copy.ts
 * turns into one templated clause. A reason that is not on this list cannot
 * be stored, which is what stops "why" from becoming a free-text field.
 */
export const FOCUS_REASONS = [
  'friction_repeated',
  'direction_worsening',
  'engagement_thin',
  'engagement_strong',
  'thin_history',
] as const;

export type FocusReason = (typeof FOCUS_REASONS)[number];

export function isFocusReason(value: unknown): value is FocusReason {
  return typeof value === 'string' && (FOCUS_REASONS as readonly string[]).includes(value);
}

/**
 * The focus itself. At least one of the two alignment fields is always
 * present (the database enforces it too), because a focus that names
 * nothing would look like a decision while being unreadable by the daily
 * engine.
 */
export type WeekFocus = {
  weekStart: string;
  actionType: CoachingActionType | null;
  threadKey: string | null;
  reason: FocusReason;
  /** Signal keys and numeric metrics only, sanitized by ./plan.ts. */
  sourceEvidence: Record<string, string | number>;
};

// ---------------------------------------------------------------------
// The whole plan.
// ---------------------------------------------------------------------

export type ReviewShape = 'full' | 'thin';

/**
 * Everything a review row stores, beyond its own timestamps. Frozen at
 * composition and rendered from all week.
 *
 * `questionKeys` is at most two, and on most weeks empty. See
 * ./questions.ts for the only two conditions that earn a question at all.
 */
export type ReviewPlan = {
  shape: ReviewShape;
  observations: ReviewObservation[];
  worked: ReviewWorked[];
  focus: WeekFocus;
  questionKeys: string[];
};

/** One review, as read back from member_weekly_reviews. */
export type WeeklyReviewRecord = {
  id: string;
  weekStart: string;
  shape: ReviewShape;
  plan: ReviewPlan;
  /** question key to option slug. Never free text. */
  answers: Record<string, string>;
  deliveredAt: string | null;
  viewedAt: string | null;
  acknowledgedAt: string | null;
};

// ---------------------------------------------------------------------
// The rendered review — built from the plan, never stored.
// ---------------------------------------------------------------------

export type RenderedQuestion = {
  key: string;
  prompt: string;
  options: { value: string; label: string }[];
  /** Her answer, when she has given one. */
  answer: string | null;
};

export type RenderedReview = {
  weekStart: string;
  shape: ReviewShape;
  /** The small label above the review, in every state. */
  label: string;
  heading: string;
  /** 2 to 4 sentences on a full review, exactly one on a thin one. */
  showedTitle: string;
  showed: string[];
  /** Absent (null) when the week genuinely produced nothing to name. */
  workedTitle: string;
  worked: string[];
  adjustingTitle: string;
  adjusting: string;
  questions: RenderedQuestion[];
  acknowledgeLabel: string;
  acknowledged: boolean;
};
