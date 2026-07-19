/**
 * Coaching Intelligence Engine — internal working types. These describe
 * data as it flows through the engine before it becomes a persisted
 * coaching_insights row (packages/shared-types-contracts/src/
 * coaching-insights.types.ts): a data source produces normalized
 * CoachingObservation[]s, a level generator (lib/coaching-insights/
 * levels.ts) turns a set of observations into a CoachingInsightDraft
 * (or nothing, if the evidence is insufficient), and the service layer
 * persists whatever drafts were actually produced.
 */

/**
 * Every source id the engine can ever reference. Only the first five are
 * backed by a real provider today (lib/coaching-insights/sources/) — the
 * platform doesn't have Sleep, Stress, Blood Work, Wearables, or Movement
 * Assessment data sources wired into this engine yet. They're listed here,
 * not implemented, so a future provider needs zero changes to this type,
 * to CoachingObservation, or to any level generator — only a new file in
 * lib/coaching-insights/sources/ that satisfies CoachingDataSourceProvider
 * below, registered in lib/coaching-insights/sources/registry.ts.
 */
export type CoachingSourceId =
  // Real, active today:
  | 'daily_checkin'
  | 'food_lens'
  | 'primal_pattern_assessment'
  | 'progress_history'
  | 'questionnaire'
  // Reserved for future providers — no active source today:
  | 'sleep'
  | 'stress'
  | 'blood_work'
  | 'wearable'
  | 'movement_assessment';

/** The currently-active subset — every provider actually registered today must have this id. */
export type ActiveCoachingSourceId =
  | 'daily_checkin'
  | 'food_lens'
  | 'primal_pattern_assessment'
  | 'progress_history'
  | 'questionnaire';

export type CoachingObservationDirection = 'low' | 'high' | 'positive' | 'negative' | 'neutral';

/**
 * One atomic, normalized fact a source contributes for one local_date —
 * the only unit level generators ever operate on. A source never emits an
 * observation it can't point at a real row for (sourceRecordId), and never
 * emits one for a date nothing was actually recorded — an absent day is
 * simply absent from the array, not filled in as 'neutral'.
 */
export interface CoachingObservation {
  sourceId: ActiveCoachingSourceId;
  localDate: string;
  /** A short, stable key, e.g. 'digestion_rating', 'protein', 'water_cups', 'momentum_score'. Never a raw column/table name exposed to a member — copy.ts maps these to plain language. */
  metric: string;
  direction: CoachingObservationDirection;
  /** The underlying value where one exists (a 1-5 rating, a cup count, a score) — kept for evidence detail, never shown as false precision to the member. */
  value: number | string | null;
  /** This one observation's own confidence (e.g. a Food Lens comparison's confidence column) — distinct from the confidence a level generator computes for the resulting statement, which also weighs evidence quantity. */
  confidence: number;
  /** Points at the real row this came from (a daily_checkins id, a food_lens_pattern_comparisons id, a root_score_snapshots id) — becomes part of the persisted statement's evidence_refs. */
  sourceRecordId: string;
}

export interface CoachingDateRange {
  from: string;
  to: string;
}

/**
 * Every current and future data source implements this — the "clean
 * interface future sources plug into without redesign" the engine
 * requires. A provider's only job is turning raw stored rows into
 * CoachingObservation[]s; it never generates a statement or judges
 * whether there's "enough" evidence — that's a level generator's job,
 * kept deliberately separate so evidence-sufficiency rules live in one
 * place (levels.ts) rather than being re-decided per source.
 */
export interface CoachingDataSourceProvider {
  id: ActiveCoachingSourceId;
  fetchObservations(
    supabase: import('@supabase/supabase-js').SupabaseClient,
    memberId: string,
    range: CoachingDateRange
  ): Promise<CoachingObservation[]>;
}

export interface CoachingEvidence {
  dataSources: ActiveCoachingSourceId[];
  dateRange: CoachingDateRange;
  observationCount: number;
  confidence: number;
  refs: { type: string; id: string; note?: string }[];
}

/** What a level generator returns — not yet persisted (no id/generatedAt), and never returned at all when the evidence bar isn't met. */
export interface CoachingInsightDraft {
  level: 1 | 2 | 3 | 4;
  statement: string;
  explanation: string;
  evidence: CoachingEvidence;
}
