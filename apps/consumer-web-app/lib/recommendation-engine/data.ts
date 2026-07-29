/**
 * Database access for the Recommendation Engine (member_recommendations,
 * migration 91) — mirrors lib/intelligence-engine/data.ts's
 * upsertCoachAlert/findAlertByKey shape exactly: pure functions taking a
 * SupabaseClient, RLS decides who may read/write what.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { completionTrackingForCategory } from './classifier';
import type { MemberRecommendation, MemberRecommendationRow } from './types';

type Row = {
  id: string;
  member_id: string;
  recommendation_key: string;
  category: string;
  source_domain: string;
  title: string;
  explanation: string;
  why_this_was_selected: string;
  supporting_findings: string[];
  confidence: number;
  priority: string;
  recommended_duration: string;
  reassessment_trigger: string | null;
  status: string;
  completed_at: string | null;
  ignored_at: string | null;
  ignored_reason: string | null;
  created_at: string;
  updated_at: string;
};

function fromRow(row: Row): MemberRecommendationRow {
  const category = row.category as MemberRecommendationRow['category'];
  return {
    id: row.id,
    memberId: row.member_id,
    recommendationId: row.recommendation_key,
    category,
    sourceDomain: row.source_domain as MemberRecommendationRow['sourceDomain'],
    title: row.title,
    explanation: row.explanation,
    whyThisWasSelected: row.why_this_was_selected,
    supportingFindings: row.supporting_findings,
    confidence: row.confidence,
    priority: row.priority as MemberRecommendationRow['priority'],
    recommendedDuration: row.recommended_duration as MemberRecommendationRow['recommendedDuration'],
    reassessmentTrigger: row.reassessment_trigger,
    // Derived from category, never stored — fully determined, storing it
    // would just be redundant data that could drift from the category.
    completionTracking: completionTrackingForCategory(category),
    status: row.status as MemberRecommendationRow['status'],
    completedAt: row.completed_at,
    ignoredAt: row.ignored_at,
    ignoredReason: row.ignored_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findByKey(
  supabase: SupabaseClient,
  memberId: string,
  recommendationKey: string
): Promise<Row | null> {
  const { data, error } = await supabase
    .from('member_recommendations')
    .select('*')
    .eq('member_id', memberId)
    .eq('recommendation_key', recommendationKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('findRecommendationByKey failed', error);
    return null;
  }
  return data as Row | null;
}

/**
 * Dedup/reopen model — same trust boundary as upsertCoachAlert (migration
 * 34): a 'shown' row with the same key is touched in place (fresh
 * title/explanation/why/findings/confidence, no duplicate); a 'completed'
 * or 'ignored' row is left alone — the member's own decision is never
 * silently reopened by recomputation; a genuinely new occurrence after
 * either is free to insert a fresh row.
 */
export async function upsertMemberRecommendation(
  supabase: SupabaseClient,
  memberId: string,
  draft: MemberRecommendation
): Promise<void> {
  const existing = await findByKey(supabase, memberId, draft.recommendationId);

  if (existing?.status === 'shown') {
    const { error } = await supabase
      .from('member_recommendations')
      .update({
        title: draft.title,
        explanation: draft.explanation,
        why_this_was_selected: draft.whyThisWasSelected,
        supporting_findings: draft.supportingFindings,
        confidence: draft.confidence,
        priority: draft.priority,
        recommended_duration: draft.recommendedDuration,
        reassessment_trigger: draft.reassessmentTrigger,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) console.error('upsertMemberRecommendation touch failed', error);
    return;
  }

  if (existing?.status === 'completed' || existing?.status === 'ignored') return; // protected — never silently reopened

  const { error } = await supabase.from('member_recommendations').insert({
    member_id: memberId,
    recommendation_key: draft.recommendationId,
    category: draft.category,
    source_domain: draft.sourceDomain,
    title: draft.title,
    explanation: draft.explanation,
    why_this_was_selected: draft.whyThisWasSelected,
    supporting_findings: draft.supportingFindings,
    confidence: draft.confidence,
    priority: draft.priority,
    recommended_duration: draft.recommendedDuration,
    reassessment_trigger: draft.reassessmentTrigger,
    status: 'shown',
  });
  if (error) console.error('upsertMemberRecommendation insert failed', error);
}

export async function listMemberRecommendations(
  supabase: SupabaseClient,
  memberId: string,
  options: { statusFilter?: MemberRecommendationRow['status'][] } = {}
): Promise<MemberRecommendationRow[]> {
  let query = supabase
    .from('member_recommendations')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });

  if (options.statusFilter && options.statusFilter.length > 0) {
    query = query.in('status', options.statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error('listMemberRecommendations failed', error);
    return [];
  }
  return (data as Row[]).map(fromRow);
}

/** Fetches one recommendation by its real DB row id, scoped to the member — the lookup Lifestyle Experiments' startMyExperiment needs to validate category and copy title/protocol verbatim. */
export async function getMemberRecommendationById(
  supabase: SupabaseClient,
  memberId: string,
  rowId: string
): Promise<MemberRecommendationRow | null> {
  const { data, error } = await supabase
    .from('member_recommendations')
    .select('*')
    .eq('id', rowId)
    .eq('member_id', memberId)
    .maybeSingle();

  if (error) {
    console.error('getMemberRecommendationById failed', error);
    return null;
  }
  return data ? fromRow(data as Row) : null;
}

async function setStatus(
  supabase: SupabaseClient,
  rowId: string,
  memberId: string,
  patch: Record<string, unknown>
): Promise<boolean> {
  const { error } = await supabase
    .from('member_recommendations')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', rowId)
    .eq('member_id', memberId);
  if (error) {
    console.error('setRecommendationStatus failed', error);
    return false;
  }
  return true;
}

/** `rowId` is the DB row's real `id` (MemberRecommendationRow.id) — NOT `recommendationId`, which is the stable dedup key shared across recomputation runs. */
export async function completeRecommendation(
  supabase: SupabaseClient,
  rowId: string,
  memberId: string
): Promise<boolean> {
  return setStatus(supabase, rowId, memberId, {
    status: 'completed',
    completed_at: new Date().toISOString(),
  });
}

export async function ignoreRecommendation(
  supabase: SupabaseClient,
  rowId: string,
  memberId: string,
  reason?: string
): Promise<boolean> {
  return setStatus(supabase, rowId, memberId, {
    status: 'ignored',
    ignored_at: new Date().toISOString(),
    ignored_reason: reason ?? null,
  });
}

export type RecommendationComputationTrigger =
  | 'check_in'
  | 'assessment_published'
  | 'questionnaire_completed'
  | 'manual';

export type RecommendationComputationState = {
  computedAt: string;
  trigger: RecommendationComputationTrigger;
};

/**
 * When (and why) this member's full recommendation set was last
 * recomputed — member_recommendation_computations (migration 116), one
 * row per member. Distinct from member_recommendations' own per-row
 * created_at/updated_at, which get touched by unrelated member actions
 * (marking a row done/not helpful) and can't answer this question on
 * their own. `null` means never computed for this member — the caller's
 * signal to compute live rather than treat as merely "stale".
 */
export async function getRecommendationComputationState(
  supabase: SupabaseClient,
  memberId: string
): Promise<RecommendationComputationState | null> {
  const { data, error } = await supabase
    .from('member_recommendation_computations')
    .select('computed_at, trigger')
    .eq('member_id', memberId)
    .maybeSingle();

  if (error) {
    console.error('getRecommendationComputationState failed', error);
    return null;
  }
  if (!data) return null;
  return { computedAt: data.computed_at as string, trigger: data.trigger as RecommendationComputationTrigger };
}

/** The member's most recent check-in's real recorded-at timestamp — the staleness signal for member_recommendation_computations (a completed check-in is always this system's own "at minimum" recompute trigger; see recomputeAndPersist's caller in app/actions/checkin.ts). `null` when the member has never checked in. */
export async function getLatestCheckinRecordedAt(
  supabase: SupabaseClient,
  memberId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('recorded_at')
    .eq('user_id', memberId)
    .order('local_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('getLatestCheckinRecordedAt failed', error);
    return null;
  }
  return (data?.recorded_at as string | undefined) ?? null;
}

/** Marks "the recommendation engine just ran, in full, for this member" — called once at the end of a successful recomputeAndPersist, never on individual row edits (mark done/not helpful). */
export async function markRecommendationsComputed(
  supabase: SupabaseClient,
  memberId: string,
  trigger: RecommendationComputationTrigger
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('member_recommendation_computations').upsert(
    {
      member_id: memberId,
      computed_at: now,
      trigger,
      updated_at: now,
    },
    { onConflict: 'member_id' }
  );
  if (error) console.error('markRecommendationsComputed failed', error);
}
