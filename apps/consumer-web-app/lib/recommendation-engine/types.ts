/**
 * The Recommendation Engine (Prompt 11) — a classification + persistence
 * layer over data every prior prompt already computes. It exists AFTER the
 * Root Router (lib/investigation-engine/rootRouter.ts,
 * lib/investigation-engine/routerOutcome.ts): it does not re-decide what
 * the router already decided, it takes `buildRecommendations()`'s
 * already-computed `Recommendation[]` (lib/intelligence-engine/
 * recommendations.ts) and the Root Router's already-computed
 * `RootRouterOutcomeView` and turns each into a richer, persistable,
 * member-visible object with a real lifecycle (shown/completed/ignored/
 * expired) — the one thing nothing upstream tracks.
 *
 * Every field on `MemberRecommendation` traces to a real, already-computed
 * input (see builder.ts) — nothing here is invented or random.
 */

import type { Recommendation, RecommendationDomain } from '../intelligence-engine/types';

/**
 * The prompt's 15 named categories, mapped deterministically from the real
 * `RecommendationDomain` vocabulary (see classifier.ts) — never a second,
 * competing taxonomy invented from scratch.
 */
export type MemberRecommendationCategory =
  | 'education'
  | 'lifestyle_experiment'
  | 'reflection'
  | 'coaching_conversation'
  | 'movement_focus'
  | 'recovery_focus'
  | 'nutrition_focus'
  | 'stress_management'
  | 'sleep_optimization'
  | 'breathing_practice'
  | 'daily_habit'
  | 'weekly_practice'
  | 'follow_up_investigation'
  | 'coach_review'
  | 'medical_referral_flag';

export type RecommendationLifecycleStatus = 'shown' | 'completed' | 'ignored' | 'expired';

export type RecommendedDuration = 'daily' | 'weekly' | 'one_time' | 'ongoing';

/** One enriched, persistable recommendation — the shape both the builder produces and data.ts persists/reads. */
export type MemberRecommendation = {
  /** Stable across recomputation runs for the same underlying signal — see classifier.ts's buildRecommendationKey(). Doubles as the DB dedup key. */
  recommendationId: string;
  category: MemberRecommendationCategory;
  /** The real Recommendation.domain this was mapped from — informational, never a second source of truth. */
  sourceDomain: RecommendationDomain;
  /** = source Recommendation.title, unedited — already member-safe copy (WELLNESS_COACHING-sourced). */
  title: string;
  /** = source Recommendation.detail, unedited. */
  explanation: string;
  /** A short, templated sentence citing which real, already-computed signal produced this — never freeform. */
  whyThisWasSelected: string;
  /** = source Recommendation.evidence, verbatim. */
  supportingFindings: string[];
  /** = source Recommendation.confidence. Coach-visible only — never rendered to members. */
  confidence: number;
  priority: Recommendation['priority'];
  recommendedDuration: RecommendedDuration;
  /** Plain-language condition under which this should be revisited; null when not applicable. */
  reassessmentTrigger: string | null;
  /** Whether this category supports a member mark-done/not-helpful action (false for coach_review / medical_referral_flag — those aren't member-completable actions). */
  completionTracking: boolean;
  status: RecommendationLifecycleStatus;
};

/** The persisted row shape (member_recommendations, migration 91) — adds what only the database tracks. */
export type MemberRecommendationRow = MemberRecommendation & {
  id: string;
  memberId: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  ignoredAt: string | null;
  ignoredReason: string | null;
};
