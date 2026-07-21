/**
 * The MEF Intelligence Engine (Milestone 8) — pure domain types.
 *
 * This is the centralized longitudinal layer every coaching surface
 * (Conversation Coach, Coaching Brain callers, Coach Dashboard,
 * notifications, reports, future agents) reads instead of independently
 * deriving its own picture of a member. It composes, rather than
 * replaces, the outputs of every subsystem that already exists:
 *
 *   - Personal Wellness Intelligence Engine (lib/intelligence/) for
 *     per-metric trend classification, patterns, and strengths
 *   - Coaching Brain (lib/brain/) for today's single deterministic
 *     decision
 *   - Member Health Narrative (lib/narrative/) for the evolving
 *     structured understanding of the member
 *   - Coaching Safety (lib/safety/) for restricted topics and review
 *     queue state
 *   - Daily Coaching Feed (lib/feed/) for streak/adherence/history
 *   - Onboarding (lib/onboarding/) for baseline/reassessment comparison
 *
 * Nothing in this file does I/O. Every function that consumes these types
 * (lib/intelligence-engine/{trends,patterns,hypotheses,recommendations,
 * summary,alerts}.ts) is a pure function over already-fetched data, same
 * discipline as lib/intelligence/*Engine.ts and lib/brain/*Engine.ts.
 */

import type {
  DailyCheckin,
  IntelligenceAlertSeverity,
  IntelligenceAlertType,
  IntelligenceEvidenceRef,
  NarrativeItem,
  RegistryEntry,
  WellnessArea,
  WellnessInsight,
  WellnessTrendState,
  WellnessTrendStrength,
} from '@mef/shared-types-contracts';
import type { WellnessMetricKey } from '../wellness/wellness-index';
import type { MetricStatus } from '../wellness/status';
import type { CoachingFocusDecision } from '../brain/types';
import type { StreakInsight } from '../feed/streakIntelligence';
import type { AdherenceInfo } from '../feed/adaptiveDifficulty';
import type { ComparisonMetric, ProgressSummary } from '../onboarding/comparison';
import type { PriorityIntelligence } from '../intelligence/types';
import type { FeedHistoryPair } from '../feed/memory';
import type { BaselineAssessment } from '../onboarding/baseline';

/**
 * Every real fact the rest of the engine reads — assembled once per
 * member/date by lib/intelligence-engine/profile.ts from data every other
 * milestone already computes. Nothing here is derived or fabricated; a
 * signal with no real data behind it is null/empty, never guessed at, same
 * discipline as lib/brain/types.ts's CoachingSignals.
 *
 * This is the "Member Health Profile" the milestone asks for — it is
 * intentionally a plain in-memory read composition, not a mutable stored
 * record, so "never overwrite history" is satisfied by construction
 * (nothing here is ever written back over a prior value). The one place
 * history IS persisted is intelligence_profile_snapshots, an append-only
 * log of what this profile produced at a point in time (see data.ts).
 */
export type MemberHealthProfile = {
  memberId: string;
  localDate: string;
  checkinsOldestFirst: DailyCheckin[];
  baseline: BaselineAssessment | null;
  latestReassessment: BaselineAssessment | null;
  comparison: ComparisonMetric[];
  progressSummary: ProgressSummary;
  narrativeItems: NarrativeItem[];
  wellnessInsights: WellnessInsight[];
  feedHistoryPairs: FeedHistoryPair[];
  brainDecision: CoachingFocusDecision;
  streak: StreakInsight;
  adherence: AdherenceInfo;
  restrictedTopics: string[];
  /**
   * Open safety_review_queue entries for this member — only visible when
   * this profile is gathered under a coach or platform_administrator
   * session (lib/safety RLS has no member SELECT policy on that table);
   * a member-triggered recalculation always sees 0 here, which is the
   * correct deny-by-default behavior, not an error.
   */
  openSafetyReviewCount: number;
  /** Same coach-only-visibility caveat as openSafetyReviewCount. */
  coachNotesCount: number;
  daysSinceLastReassessmentOrBaseline: number | null;
  /**
   * Universal Metric & Finding Registry entries (lib/registry/) — the
   * extension point this type's own docblock anticipated: "a future
   * wearable/lab-work/body-scan integration only needs to extend
   * MemberHealthProfile with its own new field" (see
   * lib/intelligence-core/service.ts's FUTURE READY note). Same RLS-driven
   * visibility asymmetry as openSafetyReviewCount: a member-triggered
   * gather sees only member_visible=true active entries, a coach-triggered
   * gather sees everything the assigned coach can see.
   */
  registryEntries: RegistryEntry[];
};

export type LongitudinalWindowKey =
  | 'last_7_days'
  | 'last_14_days'
  | 'last_30_days'
  | 'last_90_days'
  | 'since_baseline'
  | 'since_reassessment';

export type LongitudinalTrendPoint = {
  window: LongitudinalWindowKey;
  averageScore: number | null;
  sampleSize: number;
  status: MetricStatus | null;
};

export type LongitudinalDirection = 'improving' | 'declining' | 'stable' | 'insufficient_data';

/**
 * One area's picture across every analysis window. `direction` and
 * `confidence` are never re-derived by this engine — they're read
 * straight from lib/intelligence/trendEngine.ts's already-tested
 * classifyMetricTrend() so a "declining" trend here never disagrees with
 * what the Personal Wellness Intelligence Engine already concluded. The
 * `points` array is this engine's own addition: the same metric's average
 * score at 7/14/30/90 days and since baseline/reassessment, purely
 * descriptive context around that one authoritative classification.
 */
export type LongitudinalTrend = {
  area: WellnessMetricKey;
  direction: LongitudinalDirection;
  confidence: number;
  points: LongitudinalTrendPoint[];
  evidenceRefs: IntelligenceEvidenceRef[];
  /** The raw classification this direction was collapsed from (lib/intelligence/trendEngine.ts) — kept alongside `direction` for consumers (alerts.ts, recommendations.ts) that need the finer-grained read (e.g. distinguishing a 'strong' improvement worth a "rapid improvement" alert from an ordinary one). Null when there wasn't enough data to classify at all. */
  trendState: WellnessTrendState | null;
  trendStrength: WellnessTrendStrength | null;
};

export type PatternKind =
  | 'weekend_adherence'
  | 'missed_checkins'
  | 'recovery_after_setback'
  | 'effective_coaching_strategy'
  | 'repeating_barrier'
  | 'post_reassessment_change'
  | 'domain_relationship'
  | 'consistency_improvement'
  | 'lifestyle_disruption'
  | 'burnout_signal'
  | 'plateau'
  | 'body_assessment_finding'
  | 'cross_assessment_correlation';

/**
 * A single detected pattern, careful never to assert causation — every
 * `description` is written in the same correlation-safe voice
 * lib/intelligence/copy.ts already established ("tends to coincide with,"
 * never "causes"). `sourceInsightId` is set when this pattern is a
 * pass-through of an existing lib/intelligence/patternEngine.ts detector
 * result (never re-derived, just re-shaped for this report) — null for
 * the two detectors genuinely new to this engine (burnout_signal, plateau).
 */
export type PatternInsight = {
  key: string;
  kind: PatternKind;
  label: string;
  description: string;
  confidence: number;
  evidenceRefs: IntelligenceEvidenceRef[];
  sourceInsightId: string | null;
};

/**
 * A coaching hypothesis — explicitly never a diagnosis. Every field
 * required so a coach (or a future consumer) can never render just the
 * `statement` without also seeing what's known vs. inferred vs. merely
 * possible, per the milestone's "separate clearly: known facts / likely
 * patterns / possible explanations."
 */
export type RootCauseHypothesis = {
  id: string;
  statement: string;
  confidence: number;
  knownFacts: string[];
  likelyPatterns: string[];
  possibleExplanations: string[];
  supportingEvidence: IntelligenceEvidenceRef[];
  alternativeExplanations: string[];
  recommendedCoachingDirection: string;
};

/** The member's longer-term priority picture — a direct alias of the Personal Wellness Intelligence Engine's own PriorityIntelligence (lib/intelligence/priorityIntelligence.ts), reused rather than re-derived, plus the one field (coachAttentionReason) this engine adds to explain the level in plain language. */
export type CoachingPriorities = PriorityIntelligence & {
  coachAttentionReason: string | null;
};

export type RecommendationDomain =
  | 'movement'
  | 'recovery'
  | 'breathing'
  | 'sleep'
  | 'stress'
  | 'hydration'
  | 'nutrition'
  | 'reflection'
  | 'education'
  | 'assessments'
  | 'coach_follow_up'
  | 'daily_coaching'
  | 'conversation_prompts'
  | 'notifications'
  | 'automation';

export type RecommendationPriority = 'low' | 'medium' | 'high';

export type Recommendation = {
  domain: RecommendationDomain;
  title: string;
  detail: string;
  priority: RecommendationPriority;
  confidence: number;
  evidence: string[];
};

export type WellnessTrajectory =
  'improving' | 'declining' | 'stable' | 'mixed' | 'insufficient_data';

/** The living member summary — every field traces back to a real, already-computed piece of the profile; never invented. */
export type MemberSummary = {
  currentFocus: string | null;
  biggestObstacle: string | null;
  recentWins: string[];
  mostImprovedArea: WellnessMetricKey | null;
  greatestOpportunity: WellnessArea | null;
  currentCoachingStyle: string;
  recommendedNextDiscussion: string | null;
  currentMotivation: string;
  adherenceScore: number | null;
  wellnessTrajectory: WellnessTrajectory;
};

/** Pure draft form of a coach alert — lib/intelligence-engine/data.ts turns this into a persisted intelligence_coach_alerts row. */
export type CoachAlertDraft = {
  alertType: IntelligenceAlertType;
  severity: IntelligenceAlertSeverity;
  title: string;
  reason: string;
  alertKey: string;
  evidenceRefs: IntelligenceEvidenceRef[];
  sourceRefs: IntelligenceEvidenceRef[];
};

/** The complete output of one engine computation — what buildMemberIntelligence()/computeMemberIntelligence() return and what a snapshot row records. */
export type MemberIntelligenceReport = {
  memberId: string;
  localDate: string;
  generatedAt: string;
  longitudinalTrends: LongitudinalTrend[];
  patterns: PatternInsight[];
  hypotheses: RootCauseHypothesis[];
  priorities: CoachingPriorities;
  recommendations: Recommendation[];
  memberSummary: MemberSummary;
  alerts: CoachAlertDraft[];
};

export const LONGITUDINAL_METRIC_AREAS: WellnessMetricKey[] = [
  'sleep',
  'stress',
  'energy',
  'mood',
  'hydration',
  'digestion',
  'movement',
  'pain',
];
