/**
 * Data access for movement_profile_review_items (migration 81) — the
 * coach worklist backing the Movement Profile's "Pending Coach Review"
 * write level. Coach-only reads (RLS has no member select policy on this
 * table at all, same "members never see this" posture as
 * body_assessment_notes); inserts happen under the member's own session
 * (see reviewDetection.ts), resolution updates happen under the assigned
 * coach's session.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type {
  HealthTimelineEvidenceRef,
  MovementProfileReviewItem,
  MovementProfileReviewStatus,
  MovementProfileReviewType,
} from '@mef/shared-types-contracts';

export type CreateMovementProfileReviewItemInput = {
  memberId: string;
  reviewType: MovementProfileReviewType;
  summary: string;
  detail?: string | null;
  sourceFeature?: string;
  sourceRecordId?: string | null;
  evidenceRefs?: HealthTimelineEvidenceRef[];
  proposedChanges?: Record<string, unknown> | null;
};

/**
 * No `.select()` after the insert — deliberately. This table has no
 * member SELECT policy at all (coach-only, see this file's header), and
 * this function is called under the *member's own* session (the review
 * signal fires right after their own exercise completion). `INSERT ...
 * RETURNING` requires the inserting session to also be able to SELECT the
 * new row, so chaining `.select()` here would make every member-triggered
 * review item fail outright under RLS. Same reason
 * lib/exercise-library/favorites.ts's addExerciseFavorite generates its
 * own id up front instead of relying on RETURNING.
 */
export async function createMovementProfileReviewItem(
  supabase: SupabaseClient,
  input: CreateMovementProfileReviewItemInput
): Promise<MovementProfileReviewItem | null> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  const { error } = await supabase.from('movement_profile_review_items').insert({
    id,
    member_id: input.memberId,
    review_type: input.reviewType,
    summary: input.summary,
    detail: input.detail ?? null,
    source_feature: input.sourceFeature ?? 'exercise_library',
    source_record_id: input.sourceRecordId ?? null,
    evidence_refs: input.evidenceRefs ?? [],
    proposed_changes: input.proposedChanges ?? null,
    created_at: createdAt,
  });

  if (error) {
    console.error('createMovementProfileReviewItem failed', error);
    return null;
  }

  const data = {
    id,
    member_id: input.memberId,
    review_type: input.reviewType,
    summary: input.summary,
    detail: input.detail ?? null,
    source_feature: input.sourceFeature ?? 'exercise_library',
    source_record_id: input.sourceRecordId ?? null,
    evidence_refs: input.evidenceRefs ?? [],
    proposed_changes: input.proposedChanges ?? null,
    status: 'pending' as const,
    resolved_by: null,
    resolved_at: null,
    resolution_notes: null,
    created_at: createdAt,
  };
  return data as MovementProfileReviewItem;
}

/** For a coach's assigned-client worklist — newest first. */
export async function listMovementProfileReviewItemsForClient(
  supabase: SupabaseClient,
  memberId: string
): Promise<MovementProfileReviewItem[]> {
  const { data, error } = await supabase
    .from('movement_profile_review_items')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('listMovementProfileReviewItemsForClient failed', error);
    return [];
  }
  return data as MovementProfileReviewItem[];
}

export async function resolveMovementProfileReviewItem(
  supabase: SupabaseClient,
  itemId: string,
  coachId: string,
  status: Extract<MovementProfileReviewStatus, 'acknowledged' | 'actioned' | 'dismissed'>,
  resolutionNotes?: string | null
): Promise<boolean> {
  const { error } = await supabase
    .from('movement_profile_review_items')
    .update({
      status,
      resolved_by: coachId,
      resolved_at: new Date().toISOString(),
      resolution_notes: resolutionNotes ?? null,
    })
    .eq('id', itemId);

  if (error) {
    console.error('resolveMovementProfileReviewItem failed', error);
    return false;
  }
  return true;
}
