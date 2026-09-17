/**
 * The coach briefing's review state: what a coach did with a card, the
 * evidence it was done at, and when she last opened a client's briefing.
 * Coach only (migration 260 gives members no policy on either table).
 *
 * APPEND ONLY. Every action is a new row, and the newest row for a card is
 * the one that counts, so "what did she decide, and when" is always a read
 * rather than a reconstruction.
 *
 * NOTHING HERE FEEDS BACK INTO ROOT. The Association Map, the survey
 * mapping and the ranking read none of these rows: a review changes what
 * THIS coach sees in her briefing, and nothing else.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllRows } from '@/lib/data/pagedSelect';
import {
  evidenceFingerprint,
  isBriefingHistoryAction,
  parseEvidenceState,
  type BriefingEvidenceState,
  type BriefingHistoryAction,
} from './briefingRules';
import type { BriefingReviewRecord } from './briefing';

type ReviewRow = {
  id: string;
  target_key: string;
  action: string;
  acted_at: string;
  evidence_state: unknown;
};

/**
 * Every review this coach recorded on this client, oldest first.
 *
 * PAGED. One coach acting on one client's cards grows without a bound the
 * product sets, so the read asks for every row in pages and ends its order
 * on the unique id.
 */
export async function listBriefingReviews(
  supabase: SupabaseClient,
  coachId: string,
  memberId: string
): Promise<{ ok: boolean; reviews: BriefingReviewRecord[] }> {
  const read = await selectAllRows<ReviewRow>(() =>
    supabase
      .from('cross_system_root_briefing_reviews')
      .select('id, target_key, action, acted_at, evidence_state')
      .eq('coach_id', coachId)
      .eq('member_id', memberId)
      .order('acted_at', { ascending: true })
      .order('id', { ascending: true })
  );
  if (!read.ok) return { ok: false, reviews: [] };
  const reviews: BriefingReviewRecord[] = [];
  for (const row of read.rows) {
    if (!isBriefingHistoryAction(row.action)) continue;
    reviews.push({
      targetKey: row.target_key,
      action: row.action,
      actedAt: row.acted_at,
      evidenceState: parseEvidenceState(row.evidence_state),
    });
  }
  return { ok: true, reviews };
}

/**
 * Appends one review action, or a restore, at the evidence state the card
 * has now. Never an update and never a delete: a restore is a new row.
 */
export async function recordBriefingReview(
  supabase: SupabaseClient,
  input: {
    coachId: string;
    memberId: string;
    targetKey: string;
    action: BriefingHistoryAction;
    evidenceState: BriefingEvidenceState;
    actedAt: string;
  }
): Promise<boolean> {
  const { error } = await supabase.from('cross_system_root_briefing_reviews').insert({
    coach_id: input.coachId,
    member_id: input.memberId,
    target_key: input.targetKey,
    action: input.action,
    evidence_state: input.evidenceState,
    evidence_fingerprint: evidenceFingerprint(input.evidenceState),
    acted_at: input.actedAt,
  });
  if (error) {
    console.error('recordBriefingReview failed', error);
    return false;
  }
  return true;
}

/** When this coach last opened this client's briefing, or null. One row per coach and client. */
export async function readBriefingVisit(
  supabase: SupabaseClient,
  coachId: string,
  memberId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('cross_system_root_briefing_visits')
    .select('visited_at')
    .eq('coach_id', coachId)
    .eq('member_id', memberId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { visited_at: string }).visited_at;
}

/**
 * Records that this coach opened this client's briefing.
 *
 * CALLED FROM A MOUNTED EFFECT, NEVER FROM A RENDER. A render and a
 * prefetch both happen without the coach looking, and a visit written by
 * either would clear her "new since you last reviewed" markers for screens
 * she never saw.
 */
export async function recordBriefingVisit(
  supabase: SupabaseClient,
  coachId: string,
  memberId: string,
  visitedAt: string
): Promise<boolean> {
  const { error } = await supabase
    .from('cross_system_root_briefing_visits')
    .upsert(
      { coach_id: coachId, member_id: memberId, visited_at: visitedAt },
      { onConflict: 'coach_id,member_id' }
    );
  if (error) {
    console.error('recordBriefingVisit failed', error);
    return false;
  }
  return true;
}
