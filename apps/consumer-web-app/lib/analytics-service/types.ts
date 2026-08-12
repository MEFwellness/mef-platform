/**
 * Admin Analytics service layer, the shapes.
 *
 * Everything here describes BEHAVIOR: what a member opened, started,
 * finished, or stopped doing, and when. Nothing here describes a member's
 * health. No type in this file has a field for a check-in answer, a pain
 * location, a sleep number, a questionnaire response, a food detail, or any
 * other health content, and none ever should. The database side cannot
 * reach that content either: every read goes through
 * product_analytics_events, which excludes the health-content event types
 * by construction (migration 146).
 *
 * The engagement states and friction signals in this file are behavioral
 * engagement descriptions. They are not medical scores, not wellness
 * scores, and not a judgment about the member. They say where engagement is
 * breaking down. What, if anything, to do about it is a decision for the
 * coaching layer, which has the health context this layer deliberately
 * never sees.
 */

/** The presets the admin dashboard and the future Engagement Agent choose between. */
export type AnalyticsPeriodPreset = 'last_7_days' | 'last_30_days' | 'last_90_days' | 'all_time';

export type AnalyticsPeriod =
  | { preset: AnalyticsPeriodPreset }
  /** Explicit calendar days, inclusive on both ends. Always local_date strings, YYYY-MM-DD. */
  | { start: string; end: string };

export type ResolvedRange = {
  preset: AnalyticsPeriodPreset | 'custom';
  /** null means "from the first event ever recorded", which the database resolves. */
  start: string | null;
  end: string;
};

export type AnalyticsOptions = {
  period?: AnalyticsPeriod;
  /**
   * Test accounts (profiles.is_test, migration 114) are excluded from every
   * function unless this is explicitly true. Never default it to true.
   */
  includeTestAccounts?: boolean;
  /** Injectable "today" so every function is deterministic under test. Defaults to the current UTC date. */
  today?: string;
};

/** Every function reports back the range and toggle it actually used, so a number can never be read out of context. */
export type AnalyticsEnvelope = {
  range: { start: string; end: string; days?: number };
  includeTestAccounts: boolean;
};

// ---------------------------------------------------------------------
// Group A: overview
// ---------------------------------------------------------------------

export type DailyActivePoint = { localDate: string; members: number };

export type OverviewMetrics = AnalyticsEnvelope & {
  /** False when the period contains no members and no activity at all. Read this before rendering any rate. */
  hasData: boolean;
  totalMembers: number;
  newMembers: number;
  /**
   * Accounts created in the period according to profiles.created_at, next to
   * newMembers, which counts signup_completed events. They differ for
   * accounts created before product analytics shipped. Showing both is how
   * that instrumentation gap stays visible instead of looking like nobody
   * signed up.
   */
  profilesCreatedInRange: number;
  activeMembers: number;
  returningMembers: number;
  weeklyActiveMembers: number;
  dailyActiveAverage: number | null;
  dailyActiveLatest: number;
  dailyActiveSeries: DailyActivePoint[];
  /** One session means one active member-day. See SESSION_DEFINITION. */
  sessions: number;
  /** Completed sign-ins. Deliberately reported separately from sessions. */
  signIns: number;
  averageSessionsPerActiveMember: number | null;
  averageDaysBetweenVisits: number | null;
  dailyReset: {
    startedMembers: number;
    startedEvents: number;
    completedMembers: number;
    completedEvents: number;
    completionRate: number | null;
  };
  onboarding: {
    startedMembers: number;
    completedMembers: number;
    completionRate: number | null;
  };
  membersUsingNutrition: number;
  membersViewingToday: number;
  membersUsingTodaysFocus: number;
  membersUsingResetPlan: number;
  membersViewingResetPlan: number;
  membersViewingYourCase: number;
  paywallViews: { events: number; members: number };
  tierChanges: { events: number; members: number };
  purchases: { measurable: false; reason: string };
};

// ---------------------------------------------------------------------
// Group B: funnel
// ---------------------------------------------------------------------

export type FunnelStage = {
  key: string;
  label: string;
  measurable: boolean;
  /** Present only when measurable is false. Says why, in plain language. */
  unmeasurableReason: string | null;
  /** null when the stage is unmeasurable. Never a fabricated zero. */
  members: number | null;
  percentOfCohort: number | null;
  percentOfPreviousMeasurableStage: number | null;
  /** Members lost between the previous measurable stage and this one. */
  membersLostFromPreviousStage: number | null;
};

export type Funnel = AnalyticsEnvelope & {
  cohortBasis: string;
  cohortSize: number;
  profilesCreatedInRange: number;
  stages: FunnelStage[];
};

// ---------------------------------------------------------------------
// Group C: feature usage
// ---------------------------------------------------------------------

export type FeatureUsage = {
  featureKey: string;
  label: string;
  uniqueMembers: number;
  totalEvents: number;
  percentOfActiveMembers: number | null;
  repeatMembers: number;
  repeatRate: number | null;
  multiDayMembers: number;
  averageEventsPerMember: number | null;
  /** Only where a real started/completed pair exists for this feature. */
  completionRate: number | null;
  completionBasis: string | null;
  completionMeasurable: boolean | null;
  completionUnmeasurableReason: string | null;
};

export type FeatureUsageReport = AnalyticsEnvelope & {
  activeMembers: number;
  /** Ranked most to least used. */
  features: FeatureUsage[];
};

// ---------------------------------------------------------------------
// Group D: drop-off
// ---------------------------------------------------------------------

export type FlowDropOff = {
  flowKey: string;
  label: string;
  measurable: boolean;
  unmeasurableReason: string | null;
  startedEvents: number | null;
  completedEvents: number | null;
  startedMembers: number | null;
  completedMembers: number | null;
  completionRate: number | null;
  dropOffRate: number | null;
  memberCompletionRate: number | null;
};

export type DropOffReport = AnalyticsEnvelope & {
  /** Per-question drop-off is not instrumented and is reported as such rather than inferred. */
  perQuestionDropOff: { measurable: false; reason: string };
  /** Worst drop-off first. */
  flows: FlowDropOff[];
};

// ---------------------------------------------------------------------
// Group E: engagement states
// ---------------------------------------------------------------------

export type EngagementState = 'ACTIVE' | 'WATCH' | 'INACTIVE' | 'NEW';

/** How the state was decided. Never hidden from the caller. */
export type EngagementBasis =
  | 'self_comparison'
  | 'fixed_thresholds'
  | 'new_member'
  | 'never_active';

/**
 * The raw behavioral facts for one member, straight from
 * analytics_member_engagement_facts. The single detection primitive: the
 * engagement classifier, the agent queries about absence and decline, and
 * the friction signals about absence and decline all read these same
 * numbers. There is no second implementation of "days since last activity".
 */
export type MemberEngagementFacts = {
  memberId: string;
  displayName: string | null;
  accountCreatedDate: string;
  isTestAccount: boolean;
  referenceDate: string;
  firstActivityDate: string | null;
  lastActivityDate: string | null;
  daysSinceLastActivity: number | null;
  daysSinceAccountCreated: number;
  historyDays: number | null;
  lifetimeActiveDays: number;
  recentActiveDays: number;
  recentWindowDays: number;
  baselineActiveDays: number;
  baselineWindowDays: number;
  typicalGapDays: number | null;
  longestGapDays: number | null;
  /** The gap her most recent visit closed. What makes "came back after being away" observable. */
  latestGapDays: number | null;
};

export type MemberEngagement = {
  memberId: string;
  displayName: string | null;
  state: EngagementState;
  basis: EngagementBasis;
  /** Plain language, no jargon. Safe to show an administrator verbatim. */
  reason: string;
  facts: MemberEngagementFacts;
};

// ---------------------------------------------------------------------
// Detections shared by group F and the friction signals
// ---------------------------------------------------------------------

export type IncompleteFlowDetection = {
  memberId: string;
  displayName: string | null;
  flowKey: string;
  label: string;
  featureKey: string;
  startedEvents: number;
  completedEvents: number;
  startedDays: number;
  unfinishedEvents: number;
  completionRate: number | null;
  lastStartedDate: string | null;
  lastCompletedDate: string | null;
};

export type WindowBounds = { start: string; end: string; days: number };

export type FeatureChangeDetection = {
  memberId: string;
  displayName: string | null;
  featureKey: string;
  label: string;
  recentWindow: WindowBounds;
  baselineWindow: WindowBounds;
  recentEvents: number;
  baselineEvents: number;
  recentDays: number;
  baselineDays: number;
  recentRatePerDay: number;
  baselineRatePerDay: number;
  /** recent rate divided by baseline rate. null when there is no baseline to compare against. */
  changeRatio: number | null;
  lastUsedDate: string | null;
};

export type ViewWithoutEngagementDetection = {
  memberId: string;
  displayName: string | null;
  featureKey: string;
  label: string;
  views: number;
  viewDays: number;
  engagements: number;
  engagementRate: number | null;
  firstViewDate: string | null;
  lastViewDate: string | null;
};

export type ConsistentUseDetection = {
  memberId: string;
  displayName: string | null;
  featureKey: string;
  label: string;
  usedDays: number;
  events: number;
  memberActiveDays: number;
  shareOfActiveDays: number | null;
};

export type PlatformFeatureTrend = {
  featureKey: string;
  label: string;
  recentEvents: number;
  baselineEvents: number;
  recentMembers: number;
  baselineMembers: number;
  recentRatePerDay: number;
  baselineRatePerDay: number;
  changeRatio: number | null;
};

export type PlatformFeatureTrendReport = {
  referenceDate: string;
  windowDays: number;
  recentWindow: { start: string; end: string };
  baselineWindow: { start: string; end: string };
  includeTestAccounts: boolean;
  /** Steepest decline first. */
  features: PlatformFeatureTrend[];
};

// ---------------------------------------------------------------------
// The before/after comparison primitive
// ---------------------------------------------------------------------

export type WindowMetrics = {
  window: WindowBounds;
  activeDays: number;
  activeDayRate: number | null;
  signIns: number;
  dailyResetStarted: number;
  dailyResetCompleted: number;
  dailyResetCompletionRate: number | null;
  totalEvents: number;
  averageDaysBetweenVisits: number | null;
  featureUse: Array<{ featureKey: string; label: string; events: number; days: number }>;
};

export type MemberWindowComparison = {
  memberId: string;
  /** False when the member id is not a real, in-scope member (a test account with the toggle off, a coach, an unknown id). */
  inScope: boolean;
  referenceDate: string;
  windowDays: number;
  includeTestAccounts: boolean;
  /**
   * False when the after window has not finished elapsing yet. A caller
   * that ignores this and reads a half-elapsed window as a decline is
   * reading a number that is not there yet.
   */
  afterWindowComplete: boolean;
  daysOfAfterWindowElapsed: number;
  before: WindowMetrics;
  after: WindowMetrics;
};

// ---------------------------------------------------------------------
// Behavioral friction signals
// ---------------------------------------------------------------------

export type FrictionSignalType =
  | 'repeated_incomplete_flow'
  | 'onboarding_not_completed'
  | 'viewed_without_engaging'
  | 'opened_once_not_revisited'
  | 'feature_use_declined'
  | 'overall_activity_declined'
  | 'long_absence'
  | 'returned_after_absence'
  | 'consistent_feature_use'
  | 'insufficient_behavioral_history';

/**
 * How much behavioral data stands behind a signal, and how consistent it
 * is. This is NOT a medical confidence score and says nothing about the
 * member's health or her reasons. It answers one question only: how much
 * behavior did we actually observe before saying this.
 */
export type EvidenceSufficiency = 'low' | 'moderate' | 'strong';

export type FrictionSignal = {
  type: FrictionSignalType;
  /** What was observed, in plain language. Describes behavior only, never why. */
  reason: string;
  /** The numbers the reason is built from. Behavioral counts and dates only. */
  evidence: Record<string, string | number | null>;
  /** Present when the signal is a comparison against the member's own earlier behavior. */
  comparisonPeriod: { recent: WindowBounds; baseline: WindowBounds } | null;
  evidenceSufficiency: EvidenceSufficiency;
  evidenceSufficiencyReason: string;
};

export type MemberFrictionReport = AnalyticsEnvelope & {
  memberId: string;
  displayName: string | null;
  /** Empty when nothing is detectable. Never padded with a fabricated signal. */
  signals: FrictionSignal[];
  engagement: MemberEngagement;
};

// ---------------------------------------------------------------------
// Group F: agent-ready query results
// ---------------------------------------------------------------------

export type MemberFollowUpCandidate = {
  memberId: string;
  displayName: string | null;
  state: EngagementState;
  basis: EngagementBasis;
  /** Deterministic ordering key. Higher means more reasons to look, never more urgent clinically. */
  attentionScore: number;
  reasons: string[];
  signalTypes: FrictionSignalType[];
  facts: MemberEngagementFacts;
};

export type WeakestFunnelStage = {
  /** null when no stage lost anyone, or when there is not enough cohort data to say. */
  stageKey: string | null;
  label: string | null;
  previousStageKey: string | null;
  membersLost: number | null;
  dropOffRate: number | null;
  reason: string;
};
