/**
 * Database access for Longitudinal Intelligence (member_pattern_states,
 * migration 93; member_recommendation_events, migration 94) — pure
 * functions taking a SupabaseClient, RLS decides who may read/write what,
 * same shape as every other data.ts in this codebase.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LongitudinalSignal, LongitudinalSignalRow } from './types';

type PatternStateRow = {
  id: string;
  member_id: string;
  signal_key: string;
  signal_kind: string;
  signal_label: string;
  state: string;
  tier: number | null;
  occurrence_count: number;
  confidence: number;
  first_observed_at: string;
  last_observed_at: string;
  evidence_summary: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function fromRow(row: PatternStateRow): LongitudinalSignalRow {
  return {
    id: row.id,
    memberId: row.member_id,
    signalKey: row.signal_key,
    signalKind: row.signal_kind as LongitudinalSignalRow['signalKind'],
    signalLabel: row.signal_label,
    state: row.state as LongitudinalSignalRow['state'],
    tier: row.tier as LongitudinalSignalRow['tier'],
    occurrenceCount: row.occurrence_count,
    confidence: row.confidence,
    firstObservedAt: row.first_observed_at,
    lastObservedAt: row.last_observed_at,
    evidenceSummary: row.evidence_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every previously-persisted signal state for this member, keyed by signal_key — what the pure classifiers in signalState.ts read as `priorRow` for occurrence continuity. */
export async function listMemberPatternStates(
  supabase: SupabaseClient,
  memberId: string
): Promise<Map<string, LongitudinalSignalRow>> {
  const { data, error } = await supabase
    .from('member_pattern_states')
    .select('*')
    .eq('member_id', memberId);

  if (error) {
    console.error('listMemberPatternStates failed', error);
    return new Map();
  }
  return new Map((data as PatternStateRow[]).map((row) => [row.signal_key, fromRow(row)]));
}

/** Upsert-by-(member, signal_key) — same "recompute cheap, persist the resulting state" discipline as upsertMemberRecommendation. */
export async function upsertMemberPatternState(
  supabase: SupabaseClient,
  memberId: string,
  signal: LongitudinalSignal
): Promise<void> {
  const { error } = await supabase.from('member_pattern_states').upsert(
    {
      member_id: memberId,
      signal_key: signal.signalKey,
      signal_kind: signal.signalKind,
      signal_label: signal.signalLabel,
      state: signal.state,
      tier: signal.tier,
      occurrence_count: signal.occurrenceCount,
      confidence: signal.confidence,
      first_observed_at: signal.firstObservedAt,
      last_observed_at: signal.lastObservedAt,
      evidence_summary: signal.evidenceSummary,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'member_id,signal_key' }
  );
  if (error) console.error('upsertMemberPatternState failed', error);
}

export type RecommendationEventType =
  | 'started'
  | 'stopped_early'
  | 'dismissed'
  | 'marked_helpful'
  | 'marked_not_helpful'
  | 'reflection_outcome_worked'
  | 'reflection_outcome_partially_worked'
  | 'reflection_outcome_didnt_work'
  | 'reflection_outcome_inconclusive'
  | 'member_reported_improvement'
  | 'member_reported_no_change'
  | 'member_reported_worsening';

export type RecommendationEvent = {
  id: string;
  memberId: string;
  recommendationId: string;
  eventType: RecommendationEventType;
  note: string | null;
  recordedAt: string;
};

/** Fire-and-forget, best-effort: an event log entry must never block or fail the member action that produced it (same posture recordRouterDecision already takes). */
export async function recordRecommendationEvent(
  supabase: SupabaseClient,
  memberId: string,
  recommendationRowId: string,
  eventType: RecommendationEventType,
  note?: string
): Promise<void> {
  const { error } = await supabase.from('member_recommendation_events').insert({
    member_id: memberId,
    recommendation_id: recommendationRowId,
    event_type: eventType,
    note: note ?? null,
  });
  if (error) console.error('recordRecommendationEvent failed', error);
}

/** Every event for this member, most recent first — the raw material lib/recommendation-engine/outcomeHistory.ts summarizes. */
export async function listRecommendationEventsForMember(
  supabase: SupabaseClient,
  memberId: string
): Promise<RecommendationEvent[]> {
  const { data, error } = await supabase
    .from('member_recommendation_events')
    .select('id, member_id, recommendation_id, event_type, note, recorded_at')
    .eq('member_id', memberId)
    .order('recorded_at', { ascending: false });

  if (error) {
    console.error('listRecommendationEventsForMember failed', error);
    return [];
  }

  return (
    data as {
      id: string;
      member_id: string;
      recommendation_id: string;
      event_type: string;
      note: string | null;
      recorded_at: string;
    }[]
  ).map((row) => ({
    id: row.id,
    memberId: row.member_id,
    recommendationId: row.recommendation_id,
    eventType: row.event_type as RecommendationEventType,
    note: row.note,
    recordedAt: row.recorded_at,
  }));
}
