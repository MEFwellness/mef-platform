/**
 * Database access for the MEF Wellness Intelligence Core — mirrors
 * lib/intelligence-engine/data.ts's shape exactly: pure CRUD taking a
 * SupabaseClient, RLS (migration 36) decides who may read/write what.
 * Every insert generates its own id and skips `.select()` after writing,
 * same defensive discipline as wellness_insights/intelligence_coach_alerts
 * (a coach-only/member_visible=false row wouldn't satisfy the inserting
 * session's own SELECT policy on RETURNING). All lifecycle decisions
 * (insert vs. touch vs. supersede vs. resolve) live in service.ts — this
 * file only executes them.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type {
  RecommendationFeedbackOutcome,
  WellnessCoachingStyleProfile,
  WellnessIdentityObservation,
  WellnessIdentityStatus,
  WellnessProfileDimension,
  WellnessRecommendationFeedback,
} from '@mef/shared-types-contracts';
import type {
  CoachingStyleComputation,
  RecommendationFeedbackState,
  RecommendationGuardResult,
  WellnessDimensionComputation,
  WellnessIdentityObservationDraft,
} from './types';

// ---------------------------------------------------------------
// wellness_identity_observations
// ---------------------------------------------------------------

export async function findActiveIdentityObservationByKey(
  supabase: SupabaseClient,
  memberId: string,
  observationKey: string
): Promise<WellnessIdentityObservation | null> {
  const { data, error } = await supabase
    .rpc('find_active_wellness_identity_observation', {
      p_member: memberId,
      p_observation_key: observationKey,
    })
    .maybeSingle();

  if (error) {
    console.error('findActiveIdentityObservationByKey failed', error);
    return null;
  }
  return data as WellnessIdentityObservation | null;
}

export async function insertIdentityObservation(
  supabase: SupabaseClient,
  memberId: string,
  draft: WellnessIdentityObservationDraft,
  options: { supersedesId?: string | null; firstObservedAt?: string } = {}
): Promise<WellnessIdentityObservation | null> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const firstObservedAt = options.firstObservedAt ?? now;

  const { error } = await supabase.from('wellness_identity_observations').insert({
    id,
    member_id: memberId,
    domain: draft.domain,
    observation_key: draft.observationKey,
    statement: draft.statement,
    coach_detail: draft.coachDetail,
    confidence: draft.confidence,
    evidence_count: draft.evidenceCount,
    evidence_refs: draft.evidenceRefs,
    member_visible: draft.memberVisible,
    supersedes_id: options.supersedesId ?? null,
    status: 'active',
    first_observed_at: firstObservedAt,
    last_observed_at: now,
  });

  if (error) {
    console.error('insertIdentityObservation failed', error);
    return null;
  }

  return {
    id,
    member_id: memberId,
    domain: draft.domain,
    observation_key: draft.observationKey,
    statement: draft.statement,
    coach_detail: draft.coachDetail,
    confidence: draft.confidence,
    evidence_count: draft.evidenceCount,
    trend_direction: 'stable',
    status: 'active',
    evidence_refs: draft.evidenceRefs,
    member_visible: draft.memberVisible,
    coach_context: null,
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    supersedes_id: options.supersedesId ?? null,
    superseded_by_id: null,
    first_observed_at: firstObservedAt,
    last_observed_at: now,
    resolved_at: null,
    created_at: now,
    updated_at: now,
  };
}

export async function touchIdentityObservationObserved(
  supabase: SupabaseClient,
  id: string,
  patch: {
    evidenceCount: number;
    confidence: number;
    trendDirection: 'strengthening' | 'weakening' | 'stable';
  }
): Promise<void> {
  const { error } = await supabase
    .from('wellness_identity_observations')
    .update({
      evidence_count: patch.evidenceCount,
      confidence: patch.confidence,
      trend_direction: patch.trendDirection,
      last_observed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) console.error('touchIdentityObservationObserved failed', error);
}

export async function supersedeIdentityObservation(
  supabase: SupabaseClient,
  oldId: string,
  newId: string
): Promise<void> {
  const { error } = await supabase
    .from('wellness_identity_observations')
    .update({ status: 'superseded', superseded_by_id: newId, updated_at: new Date().toISOString() })
    .eq('id', oldId);
  if (error) console.error('supersedeIdentityObservation failed', error);
}

export async function resolveIdentityObservation(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from('wellness_identity_observations')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) console.error('resolveIdentityObservation failed', error);
}

export async function listIdentityObservationsForMember(
  supabase: SupabaseClient,
  memberId: string,
  options: { statusFilter?: WellnessIdentityStatus[] } = {}
): Promise<WellnessIdentityObservation[]> {
  let query = supabase
    .from('wellness_identity_observations')
    .select('*')
    .eq('member_id', memberId)
    .order('confidence', { ascending: false });

  if (options.statusFilter && options.statusFilter.length > 0) {
    query = query.in('status', options.statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error('listIdentityObservationsForMember failed', error);
    return [];
  }
  return data as WellnessIdentityObservation[];
}

// ---------------------------------------------------------------
// wellness_profile_dimensions
// ---------------------------------------------------------------

/**
 * Goes through the upsert_wellness_profile_dimension RPC — a single
 * atomic `INSERT ... ON CONFLICT DO UPDATE` inside a security-definer
 * function, not a plain `.upsert()` or a two-statement insert/update
 * probe. Two reasons, both real: (1) this table has no member SELECT
 * policy (coach-internal working data, same trust boundary as
 * intelligence_coach_alerts), and PostgREST's `.upsert()` /
 * `return=representation` filters the written row back through the
 * table's SELECT policy, so a genuinely successful write would still
 * 42501 or silently report back zero rows; (2) recalculation runs
 * repeatedly and can genuinely overlap in practice (a check-in and a
 * conversation turn close together both trigger it) — two separate REST
 * round trips (probe-then-write) leave a real gap between them for
 * another session's write to land in, where this table's per-member
 * uniqueness makes that a correctness bug, not just an inefficiency. One
 * atomic statement has no such gap.
 */
export async function upsertProfileDimension(
  supabase: SupabaseClient,
  memberId: string,
  computation: WellnessDimensionComputation
): Promise<void> {
  const { error } = await supabase.rpc('upsert_wellness_profile_dimension', {
    p_member: memberId,
    p_dimension: computation.dimension,
    p_level: computation.level,
    p_score: computation.score,
    p_confidence: computation.confidence,
    p_trend_direction: computation.trendDirection,
    p_evidence_count: computation.evidenceCount,
    p_rationale: computation.rationale,
    p_contributing_evidence: computation.contributingEvidence,
  });
  if (error) console.error('upsertProfileDimension failed', error);
}

export async function listProfileDimensionsForMember(
  supabase: SupabaseClient,
  memberId: string
): Promise<WellnessProfileDimension[]> {
  const { data, error } = await supabase
    .from('wellness_profile_dimensions')
    .select('*')
    .eq('member_id', memberId);
  if (error) {
    console.error('listProfileDimensionsForMember failed', error);
    return [];
  }
  return data as WellnessProfileDimension[];
}

// ---------------------------------------------------------------
// wellness_coaching_style_profile
// ---------------------------------------------------------------

/** Goes through the upsert_wellness_coaching_style_profile RPC — see upsertProfileDimension's docblock for why an atomic RPC replaces a real `.upsert()` or an insert/update probe here. */
export async function upsertCoachingStyleProfile(
  supabase: SupabaseClient,
  memberId: string,
  computation: CoachingStyleComputation
): Promise<void> {
  const { error } = await supabase.rpc('upsert_wellness_coaching_style_profile', {
    p_member: memberId,
    p_tone_preference: computation.tonePreference,
    p_detail_preference: computation.detailPreference,
    p_task_load_preference: computation.taskLoadPreference,
    p_time_commitment_sweet_spot_minutes: computation.timeCommitmentSweetSpotMinutes,
    p_confidence: computation.confidence,
    p_evidence_count: computation.evidenceCount,
    p_rationale: computation.rationale,
  });
  if (error) console.error('upsertCoachingStyleProfile failed', error);
}

export async function getCoachingStyleProfile(
  supabase: SupabaseClient,
  memberId: string
): Promise<WellnessCoachingStyleProfile | null> {
  const { data, error } = await supabase
    .from('wellness_coaching_style_profile')
    .select('*')
    .eq('member_id', memberId)
    .maybeSingle();
  if (error) {
    console.error('getCoachingStyleProfile failed', error);
    return null;
  }
  return data as WellnessCoachingStyleProfile | null;
}

// ---------------------------------------------------------------
// wellness_recommendation_feedback
// ---------------------------------------------------------------

/**
 * Goes through the list_own_wellness_recommendation_feedback RPC (not a
 * plain table SELECT) — this table has no member SELECT policy (still
 * coach-internal bookkeeping, never a member-facing surface), but most
 * recalculations run under the member's own session (a check-in, a
 * conversation turn), which still needs to see its own prior suppression
 * state to decide whether to suppress a recurring recommendation. Same
 * "narrow internal read, no general grant" discipline as
 * find_active_wellness_identity_observation / migration 32's dedup RPC.
 */
export async function listRecommendationFeedback(
  supabase: SupabaseClient,
  memberId: string
): Promise<RecommendationFeedbackState[]> {
  const { data, error } = await supabase.rpc('list_own_wellness_recommendation_feedback', {
    p_member: memberId,
  });
  if (error) {
    console.error('listRecommendationFeedback failed', error);
    return [];
  }
  return (data as WellnessRecommendationFeedback[]).map((row) => ({
    recommendationKey: row.recommendation_key,
    consecutiveNonActions: row.consecutive_non_actions,
    lastOutcome: row.last_outcome,
    lastEvidenceSignature: row.last_evidence_signature,
    suppressed: row.suppressed,
  }));
}

/** Goes through the upsert_wellness_recommendation_feedback RPC per row — see upsertProfileDimension's docblock for why an atomic RPC replaces a real `.upsert()` or an insert/update probe here. */
export async function upsertRecommendationFeedback(
  supabase: SupabaseClient,
  memberId: string,
  updates: RecommendationGuardResult['feedbackUpdates'],
  outcome: RecommendationFeedbackOutcome = 'surfaced'
): Promise<void> {
  for (const update of updates) {
    const { error } = await supabase.rpc('upsert_wellness_recommendation_feedback', {
      p_member: memberId,
      p_recommendation_key: update.recommendationKey,
      p_domain: update.domain,
      p_consecutive_non_actions: update.consecutiveNonActions,
      p_last_outcome: outcome,
      p_last_evidence_signature: update.evidenceSignature,
      p_suppressed: update.suppressed,
      p_suppressed_reason: update.suppressedReason,
    });
    if (error) console.error('upsertRecommendationFeedback failed', error);
  }
}
