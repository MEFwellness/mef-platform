/**
 * Coaching Intelligence Engine — database access for coaching_insights
 * (supabase/migrations/00000000000066_coaching_insights.sql). Same shape
 * as every other store module in this codebase: takes an
 * already-authenticated client and explicit memberId, RLS is the real
 * authorization boundary.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { CoachingInsight, CoachingInsightCategory } from '@mef/shared-types-contracts';
import type { CoachingInsightDraft } from './types';

export async function listCoachingInsightsForDate(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<CoachingInsight[]> {
  const { data, error } = await supabase
    .from('coaching_insights')
    .select('*')
    .eq('member_id', memberId)
    .eq('local_date', localDate);

  if (error) {
    console.error('listCoachingInsightsForDate failed', error);
    return [];
  }
  return data as CoachingInsight[];
}

export async function insertCoachingInsight(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  category: CoachingInsightCategory,
  draft: CoachingInsightDraft
): Promise<CoachingInsight | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const row = {
    id,
    member_id: memberId,
    local_date: localDate,
    category,
    level: draft.level,
    statement: draft.statement,
    explanation: draft.explanation,
    data_sources: draft.evidence.dataSources,
    date_range_start: draft.evidence.dateRange.from,
    date_range_end: draft.evidence.dateRange.to,
    observation_count: draft.evidence.observationCount,
    confidence: draft.evidence.confidence,
    evidence_refs: draft.evidence.refs,
    generated_at: now,
  };

  const { error } = await supabase.from('coaching_insights').insert(row);
  if (error) {
    // Unique-violation on (member_id, local_date, category) means another
    // concurrent request already generated today's batch first — not a
    // real failure, the caller re-reads via listCoachingInsightsForDate.
    if (error.code !== '23505') {
      console.error('insertCoachingInsight failed', error);
    }
    return null;
  }

  return { ...row, created_at: now } as CoachingInsight;
}
