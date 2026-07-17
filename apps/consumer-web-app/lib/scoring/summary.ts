/**
 * Root Score System — the safe, normalized read surface documented for
 * the AI coach system to consume once it's ready to integrate (see this
 * feature's final report for why lib/ai, lib/coaching-engine, and
 * lib/conversation-coach were deliberately left untouched by this
 * change). Nothing in those systems imports this file yet; when they do,
 * this is the one function they should call rather than reading
 * root_score_snapshots directly.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RootScoreCoachSummary, RootScoreSnapshot } from '@mef/shared-types-contracts';
import { getSnapshotForDate, getLatestSnapshotBefore } from './data';

export function toCoachSummary(snapshot: RootScoreSnapshot): RootScoreCoachSummary {
  return {
    member_id: snapshot.member_id,
    as_of_date: snapshot.local_date,
    root_score: snapshot.root_score,
    root_confidence_level: snapshot.root_confidence_level,
    root_score_change: snapshot.root_score_change,
    momentum_score: snapshot.momentum_score,
    momentum_state: snapshot.momentum_state,
    resilience_score: snapshot.resilience_score,
    resilience_state: snapshot.resilience_state,
    domain_scores: snapshot.domain_scores,
    strongest_domain: snapshot.strongest_domain,
    primary_opportunity_domain: snapshot.primary_opportunity_domain,
    positive_factors: snapshot.positive_factors,
    limiting_factors: snapshot.limiting_factors,
    recommended_next_action: snapshot.next_action,
    explanation_summary: snapshot.explanation_summary,
  };
}

/**
 * Reads the most recent snapshot at or before asOfLocalDate — never
 * triggers a calculation itself (this is a read-only summary surface,
 * not a scoring entry point; see lib/scoring/service.ts for that).
 */
export async function getScoreSummaryForCoach(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<RootScoreCoachSummary | null> {
  const today = await getSnapshotForDate(supabase, memberId, asOfLocalDate);
  const snapshot = today ?? (await getLatestSnapshotBefore(supabase, memberId, asOfLocalDate));
  if (!snapshot) return null;
  return toCoachSummary(snapshot);
}
