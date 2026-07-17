/**
 * Root Score System — shared types for the platform's wellness scoring
 * engine (Root Score, Momentum Score, Resilience Score). Mirrors the
 * `root_score_snapshots` table directly (snake_case, matching the
 * DailyCheckin/MovementSession/BodyAssessment convention already used
 * throughout this package) so a row read from Supabase needs no mapping
 * layer before it reaches a Server Component or action.
 *
 * One snapshot row = one calculation event for one member on one
 * local_date (unique per member+date — a same-day recalculation upserts
 * the existing row rather than inserting a duplicate, so the history
 * table IS the chart data with no separate rollup needed).
 */

export type ScoreDomainKey = 'recovery' | 'stress' | 'nutrition' | 'movement' | 'consistency';

/**
 * 'building' = not enough history yet to trust this number at all (first
 * calculation, or the very start of a member's journey). 'low'/'moderate'/
 * 'high' describe an already-real score's reliability — never a euphemism
 * for "the score is bad."
 */
export type ScoreConfidenceLevel = 'building' | 'low' | 'moderate' | 'high';

export type ScoreTrendDirection = 'improving' | 'declining' | 'stable' | 'unknown';

export type MomentumState = 'improving' | 'declining' | 'stable' | 'insufficient_data';

/**
 * 'building_baseline' is the only state shown until the eligibility gate
 * (lib/scoring/resilience.ts) is satisfied — never a fabricated number
 * before then. 'recovering' = a below-baseline stretch is currently in
 * progress and hasn't resolved yet.
 */
export type ResilienceState = 'building_baseline' | 'stable' | 'recovering' | 'strained';

export type DomainScore = {
  domain: ScoreDomainKey;
  label: string;
  /** 0-100, or null when the platform has no legitimate data for this domain yet. */
  score: number | null;
  confidence_level: ScoreConfidenceLevel;
  direction: ScoreTrendDirection;
  /** Count of qualifying inputs (check-in days, logged meals, sessions, ...) found in the window. */
  data_points: number;
  window_days: number;
  /** Short, deterministic, supportive one-liner — never LLM-generated. */
  explanation: string;
};

export type ScoreFactor = {
  domain: ScoreDomainKey;
  label: string;
  detail: string;
};

export type InputCoverageEntry = {
  domain: ScoreDomainKey;
  available: boolean;
  data_points: number;
  window_days: number;
};

export type RootScoreSnapshot = {
  id: string;
  member_id: string;
  local_date: string;
  timezone: string;
  calculated_at: string;
  score_version: number;

  root_score: number | null;
  /** 0-1 raw confidence value backing root_confidence_level. */
  root_confidence: number;
  root_confidence_level: ScoreConfidenceLevel;
  root_previous_score: number | null;
  root_score_change: number | null;

  momentum_score: number | null;
  momentum_state: MomentumState;
  momentum_confidence_level: ScoreConfidenceLevel;

  resilience_score: number | null;
  resilience_state: ResilienceState;
  resilience_confidence_level: ScoreConfidenceLevel;

  domain_scores: DomainScore[];
  positive_factors: ScoreFactor[];
  limiting_factors: ScoreFactor[];
  input_coverage: InputCoverageEntry[];

  strongest_domain: ScoreDomainKey | null;
  primary_opportunity_domain: ScoreDomainKey | null;
  /** One or two supportive sentences grounded only in domains that actually have data. */
  explanation_summary: string;
  next_action: string | null;

  /** Debug/audit payload: weights used, raw pre-smoothing composite, window boundaries — never rendered directly in the UI. */
  calculation_metadata: Record<string, unknown>;

  created_at: string;
  updated_at: string;
};

/**
 * Safe, normalized read surface for the AI coach system to consume once
 * it's ready to integrate — deliberately flat and free of raw
 * calculation internals. Nothing in lib/ai, lib/coaching-engine, or
 * lib/conversation-coach constructs or depends on this type yet; it
 * exists so that integration is additive when it happens.
 */
export type RootScoreCoachSummary = {
  member_id: string;
  as_of_date: string;
  root_score: number | null;
  root_confidence_level: ScoreConfidenceLevel;
  root_score_change: number | null;
  momentum_score: number | null;
  momentum_state: MomentumState;
  resilience_score: number | null;
  resilience_state: ResilienceState;
  domain_scores: DomainScore[];
  strongest_domain: ScoreDomainKey | null;
  primary_opportunity_domain: ScoreDomainKey | null;
  positive_factors: ScoreFactor[];
  limiting_factors: ScoreFactor[];
  recommended_next_action: string | null;
  explanation_summary: string;
};
