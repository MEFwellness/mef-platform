'use server';

import { createClient } from '@/lib/supabase/server';
import type {
  SafetyReviewQueueEntry,
  SafetyReviewStatus,
  SafetyAuditLogEntry,
  SafetyClassification,
} from '@mef/shared-types-contracts';
import type { ActionResult } from './auth';
import {
  listReviewQueueForCoach,
  getReviewQueueEntry,
  updateReviewQueueEntry,
  listAuditLogForReview,
  insertAuditLog,
  recordAcknowledgment,
} from '@/lib/safety/data';

/**
 * Every case currently visible to this coach (coach_read_assigned_review_queue
 * RLS, migration 28, scopes this to their own assigned clients — an
 * unassigned member's cases simply never appear here).
 */
export async function listCoachReviewQueue(
  statusFilter?: SafetyReviewStatus[]
): Promise<SafetyReviewQueueEntry[]> {
  const supabase = createClient();
  return listReviewQueueForCoach(supabase, statusFilter);
}

export async function getCoachReviewQueueEntry(reviewId: string): Promise<{
  entry: SafetyReviewQueueEntry | null;
  classification: SafetyClassification | null;
  auditLog: SafetyAuditLogEntry[];
}> {
  const supabase = createClient();
  const entry = await getReviewQueueEntry(supabase, reviewId);
  if (!entry) return { entry: null, classification: null, auditLog: [] };

  const [{ data: classification }, auditLog] = await Promise.all([
    supabase.from('safety_classifications').select('*').eq('id', entry.classification_id).single(),
    listAuditLogForReview(supabase, reviewId),
  ]);

  return {
    entry,
    classification: (classification as SafetyClassification) ?? null,
    auditLog: auditLog as SafetyAuditLogEntry[],
  };
}

/**
 * Coach controls (Milestone 1 requirement H): review, add notes, approve
 * limited coaching, maintain restrictions, document referral, mark urgent
 * follow-up, close the case. This single action covers all of those —
 * the coach picks the resulting status. Nothing here can ever change
 * coaching_allowed on the underlying classification or unlock prohibited
 * advice; it only tracks the human review workflow.
 */
export async function updateCoachReview(
  reviewId: string,
  update: { status: SafetyReviewStatus; coachNotes?: string; resolution?: string }
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const entry = await getReviewQueueEntry(supabase, reviewId);
  if (!entry) return { error: 'Review case not found.' };

  const ok = await updateReviewQueueEntry(supabase, reviewId, update);
  if (!ok) return { error: 'Could not update the review case.' };

  await insertAuditLog(supabase, {
    memberId: entry.member_id,
    classificationId: entry.classification_id,
    reviewId,
    eventType: update.status === 'closed' ? 'review_resolved' : 'review_updated',
    actorType: 'coach',
    actorId: user.id,
    summary: `Coach set status to ${update.status}.${update.resolution ? ` Resolution: ${update.resolution}` : ''}`,
    metadata: { previousStatus: entry.status, newStatus: update.status },
  });

  return {};
}

/**
 * Member-facing: records that the member has read and acknowledged a
 * shown safety message. Acknowledging never unlocks prohibited advice —
 * this only flips safety_acknowledgments.status, nothing about the
 * underlying classification's restrictions changes.
 */
export async function acknowledgeSafetyMessage(acknowledgmentId: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const { data: acknowledgment } = await supabase
    .from('safety_acknowledgments')
    .select('id, member_id, classification_id')
    .eq('id', acknowledgmentId)
    .single();
  if (!acknowledgment) return { error: 'Acknowledgment not found.' };

  const ok = await recordAcknowledgment(supabase, acknowledgmentId);
  if (!ok) return { error: 'Could not record acknowledgment.' };

  await insertAuditLog(supabase, {
    memberId: acknowledgment.member_id,
    classificationId: acknowledgment.classification_id,
    eventType: 'acknowledgment_recorded',
    actorType: 'member',
    actorId: user.id,
    summary: 'Member acknowledged the safety message.',
  });

  return {};
}

/** The signed-in member's own pending acknowledgments — for a future member-facing prompt. */
export async function getMyPendingAcknowledgments() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('safety_acknowledgments')
    .select('*')
    .eq('member_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getMyPendingAcknowledgments failed', error);
    return [];
  }
  return data;
}
