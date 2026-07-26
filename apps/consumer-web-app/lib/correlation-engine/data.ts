/**
 * Correlation Engine — database access. Pure functions taking a
 * SupabaseClient, RLS decides who may read what, same shape as every
 * other data.ts in this codebase.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CandidatePair, CorrelationFindingRow } from './types';

type CandidatePairRow = {
  pair_key: string;
  driver_id: string;
  outcome_variable: string;
  driver_variable: string;
  label: string;
  weight: 'high' | 'medium';
  goal_keys: unknown;
};

function fromCandidatePairRow(row: CandidatePairRow): CandidatePair {
  return {
    pairKey: row.pair_key,
    driverId: row.driver_id,
    outcomeVariable: row.outcome_variable,
    driverVariable: row.driver_variable,
    label: row.label,
    weight: row.weight,
    goalKeys: Array.isArray(row.goal_keys) ? row.goal_keys.map(String) : [],
  };
}

/** Every active seeded candidate pair (correlation_candidate_pairs, migration 105) — reference data, not member data. */
export async function listActiveCandidatePairs(supabase: SupabaseClient): Promise<CandidatePair[]> {
  const { data, error } = await supabase
    .from('correlation_candidate_pairs')
    .select('*')
    .eq('active', true);

  if (error) {
    console.error('listActiveCandidatePairs failed', error);
    return [];
  }
  return (data as CandidatePairRow[]).map(fromCandidatePairRow);
}

/**
 * Candidate pairs narrowed to a member's own goals — "an outcome she
 * cares about paired with a driver weighted for that goal" (requirement
 * 1). A member with no goals recorded on `memberGoalKeys` (never went
 * through the welcome flow, or it predates member_goal_selections) gets
 * every active pair instead of none, so she isn't silently excluded.
 */
export function candidatePairsForGoals(
  allPairs: CandidatePair[],
  memberGoalKeys: string[]
): CandidatePair[] {
  if (memberGoalKeys.length === 0) return allPairs;
  const goalSet = new Set(memberGoalKeys);
  return allPairs.filter((pair) => pair.goalKeys.some((key) => goalSet.has(key)));
}

type FindingRow = {
  member_id: string;
  pair_key: string;
  lag: string | null;
  direction: string | null;
  rho: number | null;
  observation_count: number;
  span_days: number | null;
  split_window_agreement: boolean;
  state: string;
  tier: number | null;
  confidence: number;
  computed_at: string;
};

function fromFindingRow(row: FindingRow): CorrelationFindingRow {
  return {
    memberId: row.member_id,
    pairKey: row.pair_key,
    lag: row.lag as CorrelationFindingRow['lag'],
    direction: row.direction as CorrelationFindingRow['direction'],
    rho: row.rho,
    observationCount: row.observation_count,
    spanDays: row.span_days,
    splitWindowAgreement: row.split_window_agreement,
    state: row.state as CorrelationFindingRow['state'],
    tier: row.tier as CorrelationFindingRow['tier'],
    confidence: row.confidence,
    computedAt: row.computed_at,
  };
}

/** This member's most recently computed evidence for every pair — what growAdaptiveSteps-style occurrence continuity (classify.ts) reads. */
export async function listMemberCorrelationFindings(
  supabase: SupabaseClient,
  memberId: string
): Promise<Map<string, CorrelationFindingRow>> {
  const { data, error } = await supabase
    .from('member_correlation_findings')
    .select('*')
    .eq('member_id', memberId);

  if (error) {
    console.error('listMemberCorrelationFindings failed', error);
    return new Map();
  }
  return new Map((data as FindingRow[]).map((row) => [row.pair_key, fromFindingRow(row)]));
}

/** Upsert-by-(member, pair) — same "recompute cheap, persist the resulting evidence" discipline as upsertMemberPatternState. */
export async function upsertMemberCorrelationFinding(
  supabase: SupabaseClient,
  finding: CorrelationFindingRow
): Promise<void> {
  const { error } = await supabase.from('member_correlation_findings').upsert(
    {
      member_id: finding.memberId,
      pair_key: finding.pairKey,
      lag: finding.lag,
      direction: finding.direction,
      rho: finding.rho,
      observation_count: finding.observationCount,
      span_days: finding.spanDays,
      split_window_agreement: finding.splitWindowAgreement,
      state: finding.state,
      tier: finding.tier,
      confidence: finding.confidence,
      computed_at: finding.computedAt,
    },
    { onConflict: 'member_id,pair_key' }
  );
  if (error) console.error('upsertMemberCorrelationFinding failed', error);
}
