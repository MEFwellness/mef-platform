/**
 * Database access for the Personal Wellness Intelligence Engine — mirrors
 * lib/narrative/data.ts's shape exactly: pure functions taking a
 * SupabaseClient, RLS (migration 31) decides who may read/write what.
 * Inserts generate their own id and skip `.select()` after writing, same
 * defensive discipline as narrative_items/safety_review_queue (a
 * coach-only, member_visible=false row wouldn't satisfy the inserting
 * member's own SELECT policy on RETURNING).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { WellnessInsight, WellnessInsightStatus } from '@mef/shared-types-contracts';
import type { WellnessInsightDraft } from './types';

export async function insertWellnessInsight(
  supabase: SupabaseClient,
  memberId: string,
  draft: WellnessInsightDraft,
  options: { safetyClassificationId?: string | null; supersedesId?: string | null } = {}
): Promise<WellnessInsight | null> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const memberVisible = options.safetyClassificationId ? false : draft.memberVisible;

  const { error } = await supabase.from('wellness_insights').insert({
    id,
    member_id: memberId,
    insight_type: draft.insightType,
    wellness_area: draft.wellnessArea,
    trend_state: draft.trendState,
    trend_strength: draft.trendStrength,
    pattern_key: draft.patternKey,
    title: draft.title,
    member_summary: draft.memberSummary,
    coach_detail: draft.coachDetail,
    confidence: draft.confidence,
    severity: draft.severity,
    time_window: draft.timeWindow,
    evidence_refs: draft.evidenceRefs,
    reasoning_codes: draft.reasoningCodes,
    recommended_coaching_response: draft.recommendedCoachingResponse,
    recommended_coach_action: draft.recommendedCoachAction,
    safety_classification_level: options.safetyClassificationId
      ? 'coach_review_required'
      : 'standard_coaching',
    safety_classification_id: options.safetyClassificationId ?? null,
    member_visible: memberVisible,
    supersedes_id: options.supersedesId ?? null,
    status: 'active',
  });

  if (error) {
    console.error('insertWellnessInsight failed', error);
    return null;
  }

  return {
    id,
    member_id: memberId,
    insight_type: draft.insightType,
    wellness_area: draft.wellnessArea,
    trend_state: draft.trendState,
    trend_strength: draft.trendStrength,
    pattern_key: draft.patternKey,
    title: draft.title,
    member_summary: draft.memberSummary,
    coach_detail: draft.coachDetail,
    confidence: draft.confidence,
    severity: draft.severity,
    time_window: draft.timeWindow,
    evidence_refs: draft.evidenceRefs,
    reasoning_codes: draft.reasoningCodes,
    recommended_coaching_response: draft.recommendedCoachingResponse,
    recommended_coach_action: draft.recommendedCoachAction,
    safety_classification_level: options.safetyClassificationId
      ? 'coach_review_required'
      : 'standard_coaching',
    safety_classification_id: options.safetyClassificationId ?? null,
    status: 'active',
    is_pinned: false,
    pinned_by: null,
    pinned_at: null,
    coach_context: null,
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    member_visible: memberVisible,
    supersedes_id: options.supersedesId ?? null,
    superseded_by_id: null,
    last_confirmed_at: null,
    expires_at: null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * The current active/confirmed row for a (member, pattern_key) pair, if
 * any — the dedup key recalculation checks before inserting a duplicate,
 * same role (category, title) plays for narrative_items.
 *
 * Goes through the find_active_wellness_insight RPC (migration 32)
 * rather than a direct table SELECT: this lookup is internal bookkeeping
 * that must see the member's OWN prior row regardless of member_visible
 * (recalculation can run under the member's own session, whose ordinary
 * SELECT policy requires member_visible = true — see that migration's
 * header for the duplicate-insight bug this fixes).
 */
export async function findActiveInsightByPatternKey(
  supabase: SupabaseClient,
  memberId: string,
  patternKey: string
): Promise<WellnessInsight | null> {
  const { data, error } = await supabase
    .rpc('find_active_wellness_insight', { p_member: memberId, p_pattern_key: patternKey })
    .maybeSingle();

  if (error) {
    console.error('findActiveInsightByPatternKey failed', error);
    return null;
  }
  return data as WellnessInsight | null;
}

/** Recalculation reached the same conclusion again — bump last_confirmed_at without touching status or coach fields. */
export async function touchInsightConfirmed(
  supabase: SupabaseClient,
  insightId: string
): Promise<void> {
  const { error } = await supabase
    .from('wellness_insights')
    .update({ last_confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', insightId);
  if (error) console.error('touchInsightConfirmed failed', error);
}

export async function supersedeWellnessInsight(
  supabase: SupabaseClient,
  oldInsightId: string,
  newInsightId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('wellness_insights')
    .update({
      status: 'superseded',
      superseded_by_id: newInsightId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', oldInsightId);

  if (error) {
    console.error('supersedeWellnessInsight failed', error);
    return false;
  }
  return true;
}

/** 'important' must outrank 'notable' must outrank 'info' — the plain alphabetical order Postgres would apply to this text column ('important' < 'info' < 'notable') gets this backwards, so severity ordering is always done here in application code, never via `.order('severity', ...)`. */
const SEVERITY_RANK: Record<WellnessInsight['severity'], number> = {
  important: 2,
  notable: 1,
  info: 0,
};

export async function listInsightsForMember(
  supabase: SupabaseClient,
  memberId: string,
  options: { statusFilter?: WellnessInsightStatus[] } = {}
): Promise<WellnessInsight[]> {
  let query = supabase
    .from('wellness_insights')
    .select('*')
    .eq('member_id', memberId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (options.statusFilter && options.statusFilter.length > 0) {
    query = query.in('status', options.statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error('listInsightsForMember failed', error);
    return [];
  }

  return (data as WellnessInsight[]).sort(
    (a, b) =>
      Number(b.is_pinned) - Number(a.is_pinned) ||
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
  );
}

export async function getWellnessInsight(
  supabase: SupabaseClient,
  insightId: string
): Promise<WellnessInsight | null> {
  const { data, error } = await supabase
    .from('wellness_insights')
    .select('*')
    .eq('id', insightId)
    .maybeSingle();
  if (error) {
    console.error('getWellnessInsight failed', error);
    return null;
  }
  return data as WellnessInsight | null;
}

/** Coach actions (section 9): confirm / dismiss / resolve — a plain status transition, same trust boundary as narrative_items' coach-only setStatus. */
export async function setInsightStatus(
  supabase: SupabaseClient,
  insightId: string,
  status: WellnessInsightStatus,
  coachId: string | null
): Promise<boolean> {
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === 'confirmed' || status === 'resolved') {
    patch.last_confirmed_at = new Date().toISOString();
    patch.coach_reviewed_by = coachId;
    patch.coach_reviewed_at = new Date().toISOString();
  }
  if (status === 'dismissed') {
    patch.coach_reviewed_by = coachId;
    patch.coach_reviewed_at = new Date().toISOString();
  }

  const { error } = await supabase.from('wellness_insights').update(patch).eq('id', insightId);
  if (error) {
    console.error('setInsightStatus failed', error);
    return false;
  }
  return true;
}

export async function setInsightPinned(
  supabase: SupabaseClient,
  insightId: string,
  pinned: boolean,
  pinnedBy: string | null
): Promise<boolean> {
  const { error } = await supabase
    .from('wellness_insights')
    .update({
      is_pinned: pinned,
      pinned_by: pinned ? pinnedBy : null,
      pinned_at: pinned ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', insightId);

  if (error) {
    console.error('setInsightPinned failed', error);
    return false;
  }
  return true;
}

/** A coach's own added context — never overwritten by recalculation once set (see lib/intelligence/service.ts's protected-from-supersede check). */
export async function setInsightCoachContext(
  supabase: SupabaseClient,
  insightId: string,
  coachContext: string,
  coachId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('wellness_insights')
    .update({
      coach_context: coachContext,
      coach_reviewed_by: coachId,
      coach_reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', insightId);

  if (error) {
    console.error('setInsightCoachContext failed', error);
    return false;
  }
  return true;
}
