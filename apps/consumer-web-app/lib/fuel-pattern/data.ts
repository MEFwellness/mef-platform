/**
 * Rooted Reset Fuel Pattern Assessment — the one place the result row is
 * written and read.
 *
 * WRITTEN ONCE PER SITTING. Finishing is a Server Action, and a Server
 * Action re-renders the route it was called from, so the same completion
 * can arrive twice inside the same second. The write reads first and the
 * database holds a unique index on session_id underneath it
 * (fuel_pattern_results_one_per_session, migration 236), because a
 * read-then-insert on its own is a race, not a guard.
 *
 * A WRITE THAT MATCHES NO POLICY RETURNS ZERO ROWS AND NO ERROR, so the
 * insert selects its row back and the caller is told plainly when nothing
 * landed rather than being handed a silent success.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FpaConfidence, FpaScoring, FuelPattern } from './types';

export type FuelPatternResultRow = {
  id: string;
  memberId: string;
  sessionId: string;
  pattern: FuelPattern;
  confidence: FpaConfidence;
  scores: { protein: number; balanced: number; carb: number };
  scoredQuestionCount: number;
  zeroWeightCount: number;
  responses: Record<string, string>;
  tendencies: string[];
  digestiveDiscomfort: boolean;
  vitalityResponse: string | null;
  createdAt: string;
};

type RawRow = {
  id: string;
  member_id: string;
  session_id: string;
  pattern: string;
  confidence: string;
  protein_score: number;
  balanced_score: number;
  carb_score: number;
  scored_question_count: number;
  zero_weight_count: number;
  responses: Record<string, string> | null;
  response_tendencies: string[] | null;
  digestive_discomfort: boolean;
  vitality_response: string | null;
  created_at: string;
};

const COLUMNS =
  'id, member_id, session_id, pattern, confidence, protein_score, balanced_score, carb_score, scored_question_count, zero_weight_count, responses, response_tendencies, digestive_discomfort, vitality_response, created_at';

function toRow(raw: RawRow): FuelPatternResultRow {
  return {
    id: raw.id,
    memberId: raw.member_id,
    sessionId: raw.session_id,
    pattern: raw.pattern as FuelPattern,
    confidence: raw.confidence as FpaConfidence,
    scores: {
      protein: raw.protein_score,
      balanced: raw.balanced_score,
      carb: raw.carb_score,
    },
    scoredQuestionCount: raw.scored_question_count,
    zeroWeightCount: raw.zero_weight_count,
    responses: raw.responses ?? {},
    tendencies: raw.response_tendencies ?? [],
    digestiveDiscomfort: raw.digestive_discomfort,
    vitalityResponse: raw.vitality_response,
    createdAt: raw.created_at,
  };
}

export async function findFuelPatternResultBySession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<FuelPatternResultRow | null> {
  const { data, error } = await supabase
    .from('fuel_pattern_results')
    .select(COLUMNS)
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error) {
    console.error('findFuelPatternResultBySession failed', error);
    return null;
  }
  return data ? toRow(data as RawRow) : null;
}

export async function findLatestFuelPatternResult(
  supabase: SupabaseClient,
  memberId: string
): Promise<FuelPatternResultRow | null> {
  const { data, error } = await supabase
    .from('fuel_pattern_results')
    .select(COLUMNS)
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('findLatestFuelPatternResult failed', error);
    return null;
  }
  return data ? toRow(data as RawRow) : null;
}

/**
 * Store the reading for one finished sitting, or hand back the one that
 * is already there. Never throws on the duplicate case, because the
 * duplicate case is a member tapping once.
 */
export async function saveFuelPatternResult(
  supabase: SupabaseClient,
  memberId: string,
  sessionId: string,
  scoring: FpaScoring
): Promise<FuelPatternResultRow | null> {
  const existing = await findFuelPatternResultBySession(supabase, sessionId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from('fuel_pattern_results')
    .insert({
      member_id: memberId,
      session_id: sessionId,
      pattern: scoring.pattern,
      confidence: scoring.confidence,
      protein_score: scoring.scores.protein,
      balanced_score: scoring.scores.balanced,
      carb_score: scoring.scores.carb,
      scored_question_count: scoring.scoredQuestionCount,
      zero_weight_count: scoring.zeroWeightCount,
      responses: scoring.responses,
      response_tendencies: scoring.tendencies,
      digestive_discomfort: scoring.digestiveDiscomfort,
      vitality_response: scoring.vitalityResponse,
    })
    .select(COLUMNS)
    .maybeSingle();

  if (error) {
    // The unique index firing means the other half of a double tap won.
    // Her row exists; read it back rather than reporting a failure.
    const settled = await findFuelPatternResultBySession(supabase, sessionId);
    if (settled) return settled;
    console.error('saveFuelPatternResult failed', error);
    return null;
  }

  // No error and no row means the insert matched no RLS policy. Say so.
  if (!data) {
    console.error('saveFuelPatternResult wrote no row', { sessionId });
    return null;
  }
  return toRow(data as RawRow);
}
