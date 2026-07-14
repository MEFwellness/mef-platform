/**
 * Database access for the safety layer — mirrors lib/ai/data.ts's shape:
 * pure functions taking a SupabaseClient, no role decisions of their own.
 * RLS (supabase/migrations/00000000000028_coaching_safety.sql) decides
 * who may read or write what; every write here uses the same
 * session-scoped client the triggering action already has.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type {
  SafetyClassification,
  SafetyClassificationLevel,
  SafetyUrgency,
  SafetyEscalationAction,
  SafetySourceFeature,
  SafetyAcknowledgment,
  SafetyReviewQueueEntry,
  SafetyReviewStatus,
  SafetyAuditEventType,
  SafetyActorType,
} from '@mef/shared-types-contracts';

export type InsertClassificationInput = {
  memberId: string;
  sourceFeature: SafetySourceFeature;
  sourceRecordType: string | null;
  sourceRecordId: string | null;
  sourceEventId: string | null;
  inputExcerpt: string | null;
  classificationLevel: SafetyClassificationLevel;
  urgency: SafetyUrgency;
  concernCategories: string[];
  reasoningCodes: string[];
  coachingAllowed: boolean;
  coachingRestrictions: Record<string, unknown>;
  restrictedTopics: string[];
  coachReviewRequired: boolean;
  acknowledgmentRequired: boolean;
  escalationAction: SafetyEscalationAction;
  messageTemplateId: string | null;
  memberMessageShown: string | null;
  policyVersion: string;
};

export async function insertClassification(
  supabase: SupabaseClient,
  input: InsertClassificationInput
): Promise<SafetyClassification | null> {
  const { data, error } = await supabase
    .from('safety_classifications')
    .insert({
      member_id: input.memberId,
      source_feature: input.sourceFeature,
      source_record_type: input.sourceRecordType,
      source_record_id: input.sourceRecordId,
      source_event_id: input.sourceEventId,
      input_excerpt: input.inputExcerpt,
      classification_level: input.classificationLevel,
      urgency: input.urgency,
      concern_categories: input.concernCategories,
      reasoning_codes: input.reasoningCodes,
      coaching_allowed: input.coachingAllowed,
      coaching_restrictions: input.coachingRestrictions,
      restricted_topics: input.restrictedTopics,
      coach_review_required: input.coachReviewRequired,
      acknowledgment_required: input.acknowledgmentRequired,
      escalation_action: input.escalationAction,
      message_template_id: input.messageTemplateId,
      member_message_shown: input.memberMessageShown,
      policy_version: input.policyVersion,
    })
    .select('*')
    .single();

  if (error) {
    console.error('insertClassification failed', error);
    return null;
  }
  return data as SafetyClassification;
}

export async function insertAcknowledgment(
  supabase: SupabaseClient,
  input: {
    classificationId: string;
    memberId: string;
    messageShown: string;
    messageVersion: string;
    classificationLevel: SafetyClassificationLevel;
  }
): Promise<SafetyAcknowledgment | null> {
  const { data, error } = await supabase
    .from('safety_acknowledgments')
    .insert({
      classification_id: input.classificationId,
      member_id: input.memberId,
      message_shown: input.messageShown,
      message_version: input.messageVersion,
      classification_level: input.classificationLevel,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) {
    console.error('insertAcknowledgment failed', error);
    return null;
  }
  return data as SafetyAcknowledgment;
}

export async function recordAcknowledgment(
  supabase: SupabaseClient,
  acknowledgmentId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('safety_acknowledgments')
    .update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() })
    .eq('id', acknowledgmentId);

  if (error) {
    console.error('recordAcknowledgment failed', error);
    return false;
  }
  return true;
}

/** The member's currently active coach, if any — reused pattern of listAssignedClients (app/actions/coach.ts) run in reverse. */
export async function resolveAssignedCoach(
  supabase: SupabaseClient,
  memberId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('coach_client_assignments')
    .select('coach_id')
    .eq('client_id', memberId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('resolveAssignedCoach failed', error);
    return null;
  }
  return data?.coach_id ?? null;
}

export type InsertReviewQueueInput = {
  memberId: string;
  assignedCoachId: string | null;
  classificationId: string;
  sourceFeature: string;
  sourceRecordType: string | null;
  sourceRecordId: string | null;
  memberInputExcerpt: string | null;
  concernCategories: string[];
  classificationLevel: SafetyClassificationLevel;
  urgency: SafetyUrgency;
  restrictionsApplied: Record<string, unknown>;
};

/**
 * Deliberately does NOT chain `.select()` after the insert. Postgres RLS
 * filters `RETURNING` through the table's SELECT policies, not just the
 * INSERT's WITH CHECK — and by design (migration 28), a member has no
 * SELECT policy on safety_review_queue (it's coach-internal working
 * data). Since this function is called from the member's own session for
 * member-triggered events (e.g. a medication question in check-in
 * notes), asking PostgREST to return the inserted row would fail RLS even
 * though the insert itself is fully authorized. Generating the id
 * ourselves sidesteps RETURNING entirely while keeping the member truly
 * unable to read the table back — caught by tests/safety-integration.test.ts.
 */
export async function insertReviewQueueEntry(
  supabase: SupabaseClient,
  input: InsertReviewQueueInput
): Promise<SafetyReviewQueueEntry | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('safety_review_queue').insert({
    id,
    member_id: input.memberId,
    assigned_coach_id: input.assignedCoachId,
    classification_id: input.classificationId,
    source_feature: input.sourceFeature,
    source_record_type: input.sourceRecordType,
    source_record_id: input.sourceRecordId,
    member_input_excerpt: input.memberInputExcerpt,
    concern_categories: input.concernCategories,
    classification_level: input.classificationLevel,
    urgency: input.urgency,
    restrictions_applied: input.restrictionsApplied,
    status: 'new',
  });

  if (error) {
    console.error('insertReviewQueueEntry failed', error);
    return null;
  }

  return {
    id,
    member_id: input.memberId,
    assigned_coach_id: input.assignedCoachId,
    classification_id: input.classificationId,
    source_feature: input.sourceFeature,
    source_record_type: input.sourceRecordType,
    source_record_id: input.sourceRecordId,
    member_input_excerpt: input.memberInputExcerpt,
    concern_categories: input.concernCategories,
    classification_level: input.classificationLevel,
    urgency: input.urgency,
    restrictions_applied: input.restrictionsApplied,
    status: 'new',
    coach_notes: null,
    resolution: null,
    created_at: now,
    updated_at: now,
  };
}

export async function updateReviewQueueEntry(
  supabase: SupabaseClient,
  reviewId: string,
  update: { status?: SafetyReviewStatus; coachNotes?: string; resolution?: string }
): Promise<boolean> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (update.status !== undefined) patch.status = update.status;
  if (update.coachNotes !== undefined) patch.coach_notes = update.coachNotes;
  if (update.resolution !== undefined) patch.resolution = update.resolution;

  const { error } = await supabase.from('safety_review_queue').update(patch).eq('id', reviewId);

  if (error) {
    console.error('updateReviewQueueEntry failed', error);
    return false;
  }
  return true;
}

export async function listReviewQueueForCoach(
  supabase: SupabaseClient,
  statusFilter?: SafetyReviewStatus[]
): Promise<SafetyReviewQueueEntry[]> {
  let query = supabase
    .from('safety_review_queue')
    .select('*')
    .order('created_at', { ascending: false });
  if (statusFilter && statusFilter.length > 0) {
    query = query.in('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error('listReviewQueueForCoach failed', error);
    return [];
  }
  return data as SafetyReviewQueueEntry[];
}

export async function getReviewQueueEntry(
  supabase: SupabaseClient,
  reviewId: string
): Promise<SafetyReviewQueueEntry | null> {
  const { data, error } = await supabase
    .from('safety_review_queue')
    .select('*')
    .eq('id', reviewId)
    .maybeSingle();

  if (error) {
    console.error('getReviewQueueEntry failed', error);
    return null;
  }
  return data as SafetyReviewQueueEntry | null;
}

export async function insertAuditLog(
  supabase: SupabaseClient,
  input: {
    memberId: string;
    classificationId?: string | null;
    reviewId?: string | null;
    eventType: SafetyAuditEventType;
    actorType: SafetyActorType;
    actorId?: string | null;
    policyVersion?: string | null;
    summary: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.from('safety_audit_log').insert({
    member_id: input.memberId,
    classification_id: input.classificationId ?? null,
    review_id: input.reviewId ?? null,
    event_type: input.eventType,
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
    policy_version: input.policyVersion ?? null,
    summary: input.summary,
    metadata: input.metadata ?? {},
  });

  // Audit logging must never throw — same discipline as lib/ai/data.ts's insertLog.
  if (error) {
    console.error('insertAuditLog failed', error);
  }
}

export async function listAuditLogForReview(supabase: SupabaseClient, reviewId: string) {
  const { data, error } = await supabase
    .from('safety_audit_log')
    .select('*')
    .eq('review_id', reviewId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('listAuditLogForReview failed', error);
    return [];
  }
  return data;
}
