/**
 * MEF Wellness Intelligence Core (Milestone 9) — pure domain types.
 *
 * Disambiguation, because this codebase now has three similarly-named
 * layers and confusing them would be easy:
 *
 *   lib/intelligence/         Personal Wellness Intelligence Engine —
 *                              per-metric trend/pattern/strength detectors
 *                              over daily check-ins. Answers "what is
 *                              changing."
 *
 *   lib/intelligence-engine/   MEF Intelligence Engine — composes Brain +
 *                              Wellness Intelligence + Narrative + Safety +
 *                              Feed into longitudinal trends, patterns,
 *                              root-cause hypotheses, priorities,
 *                              recommendations, and a member summary.
 *                              Answers "what does this all mean right
 *                              now, and why."
 *
 *   lib/intelligence-core/     (this directory) MEF Wellness Intelligence
 *                              Core — the one layer above both: it does
 *                              not recompute trends or hypotheses, it
 *                              reads the Intelligence Engine's report
 *                              (composeIntelligenceFromProfile) plus
 *                              Conversation Coach memory and Daily Feed
 *                              engagement history, and builds the durable
 *                              things nothing else persists — a
 *                              confidence-weighted "Wellness Identity"
 *                              (how this member responds to coaching, not
 *                              what their metrics are doing), a named
 *                              Wellness Profile (15 coaching-model
 *                              dimensions), a learned Coaching Style
 *                              Profile, prioritization capped to "one
 *                              primary, two secondary, everything else
 *                              waits," and recommendation-repeat
 *                              suppression. Answers "who is this person,
 *                              as a coaching subject, and how should we
 *                              talk to them." Every coaching surface
 *                              should eventually read from here for that
 *                              question rather than re-deriving it —
 *                              exactly the same "compose, never
 *                              duplicate" discipline
 *                              lib/intelligence-engine/types.ts already
 *                              established one layer down.
 *
 * Nothing in this file does I/O; every function that consumes these types
 * (observations.ts, dimensions.ts, coachingStyle.ts, prioritization.ts,
 * recommendationGuard.ts) is a pure function over already-fetched data.
 */

import type {
  CoachingDetailPreference,
  CoachingTaskLoadPreference,
  CoachingTonePreference,
  RecommendationFeedbackOutcome,
  WellnessIdentityDomain,
  WellnessIdentityEvidenceRef,
  WellnessIdentityTrendDirection,
  WellnessProfileDimensionKey,
  WellnessProfileLevel,
  WellnessProfileTrendDirection,
} from '@mef/shared-types-contracts';
import type { Recommendation, RecommendationDomain } from '../intelligence-engine/types';

/** Pure draft form of one identity observation — data.ts turns this into a persisted (or superseded/touched) wellness_identity_observations row. */
export type WellnessIdentityObservationDraft = {
  domain: WellnessIdentityDomain;
  observationKey: string;
  statement: string;
  coachDetail: string;
  confidence: number;
  evidenceCount: number;
  evidenceRefs: WellnessIdentityEvidenceRef[];
  memberVisible: boolean;
};

/** Pure output of one dimension's computation — data.ts upserts this into wellness_profile_dimensions. */
export type WellnessDimensionComputation = {
  dimension: WellnessProfileDimensionKey;
  level: WellnessProfileLevel;
  score: number | null;
  confidence: number;
  trendDirection: WellnessProfileTrendDirection;
  evidenceCount: number;
  rationale: string;
  contributingEvidence: WellnessIdentityEvidenceRef[];
};

/** Pure output of the coaching-style inference — data.ts upserts this into wellness_coaching_style_profile. */
export type CoachingStyleComputation = {
  tonePreference: CoachingTonePreference;
  detailPreference: CoachingDetailPreference;
  taskLoadPreference: CoachingTaskLoadPreference;
  timeCommitmentSweetSpotMinutes: number | null;
  confidence: number;
  evidenceCount: number;
  rationale: string;
};

/** One leverage-ranked opportunity — never more than 3 total surface at once (section "COACH PRIORITIZATION"). */
export type PrioritizedOpportunity = {
  domain: RecommendationDomain;
  title: string;
  detail: string;
  confidence: number;
};

/** "Choose the highest leverage. Never overwhelm members. One primary focus. Two secondary opportunities. Everything else waits." — a pure reshaping of Recommendation[] the Intelligence Engine already computed, never a second recommendation source. */
export type WellnessCorePrioritization = {
  primary: PrioritizedOpportunity | null;
  secondary: PrioritizedOpportunity[]; // max 2
  deferredCount: number;
};

/** Input to recommendationGuard.ts's suppression pass — one row of already-persisted feedback state per recommendation_key, or none yet. */
export type RecommendationFeedbackState = {
  recommendationKey: string;
  consecutiveNonActions: number;
  lastOutcome: RecommendationFeedbackOutcome;
  lastEvidenceSignature: string;
  suppressed: boolean;
};

/** Output of recommendationGuard.ts: the recommendations still worth surfacing, plus the updated feedback rows to persist. */
export type RecommendationGuardResult = {
  surfaced: Recommendation[];
  feedbackUpdates: {
    recommendationKey: string;
    domain: string;
    evidenceSignature: string;
    consecutiveNonActions: number;
    suppressed: boolean;
    suppressedReason: string | null;
  }[];
};

/** The member-safe view of one identity observation — no confidence, no evidence, no domain code, positive/plain-language only (section "MEMBER EXPERIENCE"). */
export type MemberWellnessHighlight = {
  id: string;
  statement: string;
};

/**
 * The member-safe view of IntelligenceCoreSummary — same stripping
 * discipline as MemberWellnessHighlight (no confidence, no evidence, no
 * domain/dimension codes, no recommendation detail text), for the Wellness
 * Story dashboard. Titles only — plain labels a member already sees
 * elsewhere in coach-dashboard language, never the underlying rationale.
 */
export type MemberWellnessStorySummary = {
  topStrengths: string[];
  biggestOpportunities: string[];
  emergingConcerns: string[];
  recentWins: string[];
  longTermTrendSummary: string | null;
  motivationProfile: string;
  primaryPriorityTitle: string | null;
  secondaryPriorityTitles: string[];
};

/** A plain title/detail/confidence highlight — used for strengths/opportunities the Coach Dashboard shows that aren't necessarily tied to a specific RecommendationDomain (unlike PrioritizedOpportunity, which always is). */
export type WellnessHighlightItem = {
  title: string;
  detail: string;
  confidence: number;
};

/** The Coach Dashboard's "Intelligence Summary" payload (section "COACH DASHBOARD") — composes the Intelligence Engine's report with this layer's identity/profile/style/prioritization additions. Every field traces back to already-computed data; nothing here is invented. */
export type IntelligenceCoreSummary = {
  memberId: string;
  localDate: string;
  generatedAt: string;
  topStrengths: WellnessHighlightItem[];
  biggestOpportunities: WellnessHighlightItem[];
  emergingConcerns: string[];
  recentWins: string[];
  longTermTrendSummary: string | null;
  motivationProfile: string;
  currentCoachingStrategy: string;
  prioritization: WellnessCorePrioritization;
  identityObservations: {
    id: string;
    domain: WellnessIdentityDomain;
    statement: string;
    coachDetail: string;
    confidence: number;
    evidenceCount: number;
    trendDirection: WellnessIdentityTrendDirection;
  }[];
  profileDimensions: WellnessDimensionComputation[];
  coachingStyle: CoachingStyleComputation;
  recommendations: Recommendation[];
};
