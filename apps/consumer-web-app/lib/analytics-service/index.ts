/**
 * Admin Analytics service layer, the public surface.
 *
 * Server-side only. Every function takes a Supabase client whose session
 * belongs to a platform administrator (or a service-role client), a date
 * range, and a test-account toggle. There is no UI in this layer and no
 * member-facing code path anywhere in it.
 *
 * The layout:
 *   range.ts            date range resolution, pure, the calendar-day rule
 *   client.ts           the one RPC call path, and the access-denied error
 *   reports.ts          groups A to D: overview, funnel, feature usage, drop-off
 *   engagementState.ts  group E: the engagement rules, pure and documented
 *   detections.ts       the shared detection primitives, one per condition
 *   comparison.ts       the before/after primitive
 *   timeline.ts         one member's own days, features, starts and completions
 *   friction.ts         behavioral friction signals, built on the detections
 *   queries.ts          group F: the agent-ready questions, all wrappers
 *
 * See docs/ADMIN_ANALYTICS.md for the definitions, thresholds, and the
 * list of what cannot be measured yet and why.
 */

export * from './types';
export {
  DEFAULT_PERIOD,
  PRESET_DAYS,
  daysBetweenInclusive,
  isCalendarDate,
  resolveAnalyticsRange,
  shiftCalendarDate,
  todayUtc,
} from './range';
export { AnalyticsAccessDeniedError, AnalyticsQueryError } from './client';
export {
  ACTIVE_DEFINITION,
  SESSION_DEFINITION,
  addFunnelPercentages,
  getDropOff,
  getFeatureUsage,
  getFunnel,
  getOverviewMetrics,
} from './reports';
export {
  ABSENCE_GAP_MULTIPLIER,
  DECLINE_RATIO as ENGAGEMENT_DECLINE_RATIO,
  FIXED_ACTIVE_MAX_DAYS,
  FIXED_WATCH_MAX_DAYS,
  MIN_ABSENCE_DAYS,
  MIN_BASELINE_ACTIVE_DAYS_FOR_SELF_COMPARISON,
  MIN_HISTORY_DAYS_FOR_SELF_COMPARISON,
  NEW_ACCOUNT_GRACE_DAYS,
  NEW_MEMBER_HISTORY_DAYS,
  absenceToleranceDays,
  activityRates,
  classifyEngagementState,
  hasSelfComparisonBaseline,
  toMemberEngagement,
} from './engagementState';
export {
  DEFAULT_CHANGE_WINDOW_DAYS,
  getConsistentFeatureUse,
  getIncompleteFlows,
  getMemberEngagementFacts,
  getMemberEngagementStates,
  getMemberFeatureChanges,
  getPlatformFeatureTrend,
  getViewsWithoutEngagement,
} from './detections';
export {
  DEFAULT_COMPARISON_WINDOW_DAYS,
  compareWindows,
  getMemberWindowComparison,
} from './comparison';
export type { MetricDelta, WindowComparisonOptions } from './comparison';
export { TIMELINE_ROW_CAP, getMemberActivityTimeline } from './timeline';
export type {
  MemberActivityTimeline,
  MemberTimelineDay,
  TimelineFeatureCount,
} from './timeline';
export {
  CONSISTENT_USE_MINIMUM_DAYS,
  CONSISTENT_USE_SHARE,
  FEATURE_DECLINE_MINIMUM_BASELINE_EVENTS,
  INCOMPLETE_COMPLETION_RATE,
  MINIMUM_HISTORY_DAYS_FOR_ANY_SIGNAL,
  NOT_REVISITED_AFTER_DAYS,
  REPEATED_START_MINIMUM,
  RETURN_AFTER_ABSENCE_GAP_DAYS,
  RETURN_RECENCY_DAYS,
  VIEW_WITHOUT_ENGAGEMENT_MINIMUM_VIEWS,
  consistentUseSignals,
  evidenceSufficiency,
  featureDeclineSignals,
  getMemberFrictionSignals,
  incompleteFlowSignals,
  insufficientHistorySignal,
  longAbsenceSignals,
  notRevisitedSignals,
  overallDeclineSignals,
  returnedAfterAbsenceSignals,
  viewWithoutEngagementSignals,
} from './friction';
export {
  findDisengagedMembers,
  findFeaturesWithUnusualUsageDrops,
  findMemberFeatureDeclines,
  findMembersForCoachFollowUp,
  findMembersNotReturnedRecently,
  findMembersWithIncompleteFlows,
  findMembersWithReducedUsage,
  findWeakestFunnelStage,
} from './queries';
