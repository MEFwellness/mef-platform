/**
 * Root Score System — the single orchestration function that turns a
 * member's real, already-fetched rows into a complete score snapshot.
 * Pure and side-effect-free: every dependency (checkins, meal-quality
 * events, movement sessions, body assessments, the previous snapshot) is
 * passed in, nothing is fetched here, and nothing is written here — see
 * lib/scoring/service.ts for the Supabase-touching orchestration that
 * calls this. That split is what makes this function trivially unit-
 * testable without a database.
 */

import type {
  BodyAssessment,
  DailyCheckin,
  DomainScore,
  InputCoverageEntry,
  MovementSession,
  RootScoreSnapshot,
} from '@mef/shared-types-contracts';
import { addDaysToLocalDate } from '@/lib/feed/dateMath';
import { applySmoothingCap, computeComposite } from './aggregate';
import { computeRootConfidence } from './confidence';
import {
  MOMENTUM_PRIOR_WINDOW_DAYS,
  MOMENTUM_RECENT_WINDOW_DAYS,
  ROOT_WINDOW_DAYS,
  RESILIENCE_LOOKBACK_DAYS,
  SCORE_VERSION,
} from './config';
import {
  computeConsistencyDomain,
  computeMovementDomain,
  computeNutritionDomain,
  computeRecoveryDomain,
  computeStressDomain,
  type DateWindow,
  type MealQualityEvent,
} from './domains';
import { buildExplanation } from './explain';
import { computeMomentum } from './momentum';
import { computeResilience } from './resilience';

export type CalculateRootScoreInput = {
  localDate: string;
  timezone: string;
  /**
   * Oldest-first, spanning at least RESILIENCE_LOOKBACK_DAYS back from
   * localDate (a shorter history is fine — every window below simply
   * finds less data in it, never an error).
   */
  checkins: DailyCheckin[];
  /** Spanning at least ROOT_WINDOW_DAYS back from localDate. */
  mealQualityEvents: MealQualityEvent[];
  /** Spanning at least ROOT_WINDOW_DAYS back from localDate. */
  movementSessions: MovementSession[];
  /** Spanning at least ROOT_WINDOW_DAYS back from localDate. */
  bodyAssessments: BodyAssessment[];
  /** The member's most recent snapshot strictly before localDate, or null on a first-ever calculation. */
  previousSnapshot: { root_score: number | null } | null;
  /** Count of snapshots strictly before localDate — feeds root confidence's history factor. */
  priorSnapshotCount: number;
};

export type CalculatedSnapshot = Omit<
  RootScoreSnapshot,
  'id' | 'member_id' | 'local_date' | 'timezone' | 'calculated_at' | 'created_at' | 'updated_at'
>;

function firstEverCheckinDate(checkinsOldestFirst: DailyCheckin[]): string | null {
  return checkinsOldestFirst.length > 0 ? checkinsOldestFirst[0]!.local_date : null;
}

function computeAllDomains(
  input: CalculateRootScoreInput,
  window: DateWindow,
  firstCheckinDate: string | null
): DomainScore[] {
  return [
    computeRecoveryDomain(input.checkins, window),
    computeStressDomain(input.checkins, window),
    computeNutritionDomain(input.mealQualityEvents, window),
    computeMovementDomain(input.movementSessions, input.bodyAssessments, window),
    computeConsistencyDomain(input.checkins, firstCheckinDate, window),
  ];
}

export function calculateRootScoreSnapshot(input: CalculateRootScoreInput): CalculatedSnapshot {
  const firstCheckinDate = firstEverCheckinDate(input.checkins);

  // ---- Root Score: 30-day rolling window ----
  const rootWindow: DateWindow = {
    startDate: addDaysToLocalDate(input.localDate, -(ROOT_WINDOW_DAYS - 1)),
    endDate: input.localDate,
  };
  const domainScores = computeAllDomains(input, rootWindow, firstCheckinDate);
  const composite = computeComposite(domainScores);

  const previousRootScore = input.previousSnapshot?.root_score ?? null;
  const rootScore =
    composite.score === null ? null : applySmoothingCap(composite.score, previousRootScore);
  const { confidence: rootConfidence, level: rootConfidenceLevel } =
    composite.score === null
      ? { confidence: 0, level: 'building' as const }
      : computeRootConfidence(composite.coverageRatio, input.priorSnapshotCount);
  const rootScoreChange =
    rootScore === null || previousRootScore === null ? null : rootScore - previousRootScore;

  // ---- Momentum: trailing 7 days vs the 7 days before that ----
  const recentWindow: DateWindow = {
    startDate: addDaysToLocalDate(input.localDate, -(MOMENTUM_RECENT_WINDOW_DAYS - 1)),
    endDate: input.localDate,
  };
  const priorWindowEnd = addDaysToLocalDate(recentWindow.startDate, -1);
  const priorWindow: DateWindow = {
    startDate: addDaysToLocalDate(priorWindowEnd, -(MOMENTUM_PRIOR_WINDOW_DAYS - 1)),
    endDate: priorWindowEnd,
  };
  const recentDomains = computeAllDomains(input, recentWindow, firstCheckinDate);
  const priorDomains = computeAllDomains(input, priorWindow, firstCheckinDate);
  const momentum = computeMomentum(recentDomains, priorDomains);

  // ---- Resilience: full available lookback ----
  const resilienceStart = addDaysToLocalDate(input.localDate, -(RESILIENCE_LOOKBACK_DAYS - 1));
  const resilienceCheckins = input.checkins.filter(
    (c) => c.local_date >= resilienceStart && c.local_date <= input.localDate
  );
  const resilience = computeResilience(resilienceCheckins, input.localDate);

  // ---- Explanation, factors, next action — all deterministic ----
  const explanation = buildExplanation(domainScores);
  const inputCoverage: InputCoverageEntry[] = domainScores.map((d) => ({
    domain: d.domain,
    available: d.score !== null,
    data_points: d.data_points,
    window_days: d.window_days,
  }));

  return {
    score_version: SCORE_VERSION,

    root_score: rootScore,
    root_confidence: rootConfidence,
    root_confidence_level: rootConfidenceLevel,
    root_previous_score: previousRootScore,
    root_score_change: rootScoreChange,

    momentum_score: momentum.score,
    momentum_state: momentum.state,
    momentum_confidence_level: momentum.confidenceLevel,

    resilience_score: resilience.score,
    resilience_state: resilience.state,
    resilience_confidence_level: resilience.confidenceLevel,

    domain_scores: domainScores,
    positive_factors: explanation.positiveFactors,
    limiting_factors: explanation.limitingFactors,
    input_coverage: inputCoverage,

    strongest_domain: explanation.strongestDomain,
    primary_opportunity_domain: explanation.primaryOpportunityDomain,
    explanation_summary: explanation.explanationSummary,
    next_action: explanation.nextAction,

    calculation_metadata: {
      raw_composite: composite.score,
      coverage_ratio: composite.coverageRatio,
      root_window: rootWindow,
      momentum_recent_window: recentWindow,
      momentum_prior_window: priorWindow,
      resilience_lookback_start: resilienceStart,
      resilience_cycles_found: resilience.cyclesFound,
    },
  };
}
