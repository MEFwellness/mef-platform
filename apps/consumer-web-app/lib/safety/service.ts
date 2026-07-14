/**
 * The central safety classification service — the single reusable entry
 * point every coaching-output pathway calls into (checkin.ts today;
 * dispatcher.ts's outputGuard; the Daily Coaching Feed in Milestone 3;
 * conversational coaching in the future Milestone 5). Runs the
 * deterministic classifier, resolves the approved member-facing message,
 * persists the full audit trail, and — when the classification requires
 * it — opens a Coach Review Queue entry.
 *
 * Every write here uses the SAME session-scoped SupabaseClient the
 * triggering action already has; RLS (migration 28) is what actually
 * authorizes each write, same pattern as lib/ai/dispatcher.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SafetyActorType,
  SafetyClassification,
  SafetySourceFeature,
} from '@mef/shared-types-contracts';
import { classifyConcern, type SafetyClassificationResult } from './classifier';
import { resolveMessageTemplate } from './messages';
import {
  insertClassification,
  insertAcknowledgment,
  insertReviewQueueEntry,
  insertAuditLog,
  resolveAssignedCoach,
} from './data';

export type EvaluateConcernInput = {
  memberId: string;
  sourceFeature: SafetySourceFeature;
  sourceRecordType?: string | null;
  sourceRecordId?: string | null;
  sourceEventId?: string | null;
  text?: string | null;
  newOrWorseningConcern?: boolean;
  /** Who actually triggered this evaluation — defaults to 'member'. A coach note or an internal agent-output guard passes 'coach'/'system'. */
  actorType?: SafetyActorType;
  actorId?: string | null;
};

export type SafetyEvaluationResult = {
  classification: SafetyClassification;
  result: SafetyClassificationResult;
  memberMessage: { title: string; body: string } | null;
  acknowledgmentId: string | null;
  reviewId: string | null;
};

/** Truncated so free-text input never balloons an audit row — the classifier already ran on the full text before this. */
function excerpt(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.length > 500 ? `${trimmed.slice(0, 500)}…` : trimmed;
}

export async function evaluateConcern(
  supabase: SupabaseClient,
  input: EvaluateConcernInput
): Promise<SafetyEvaluationResult | null> {
  const actorType: SafetyActorType = input.actorType ?? 'member';
  const result = classifyConcern({
    text: input.text,
    newOrWorseningConcern: input.newOrWorseningConcern,
  });

  const needsMessage = result.classificationLevel !== 'standard_coaching';
  const template = needsMessage
    ? await resolveMessageTemplate(supabase, result.classificationLevel, result.primaryCategory)
    : null;
  const memberMessage = template ? { title: template.title, body: template.body } : null;

  const classification = await insertClassification(supabase, {
    memberId: input.memberId,
    sourceFeature: input.sourceFeature,
    sourceRecordType: input.sourceRecordType ?? null,
    sourceRecordId: input.sourceRecordId ?? null,
    sourceEventId: input.sourceEventId ?? null,
    inputExcerpt: excerpt(input.text),
    classificationLevel: result.classificationLevel,
    urgency: result.urgency,
    concernCategories: result.concernCategories,
    reasoningCodes: result.reasoningCodes,
    coachingAllowed: result.coachingAllowed,
    coachingRestrictions: { restrictedTopics: result.restrictedTopics },
    restrictedTopics: result.restrictedTopics,
    coachReviewRequired: result.coachReviewRequired,
    acknowledgmentRequired: result.acknowledgmentRequired,
    escalationAction: result.escalationAction,
    messageTemplateId: template?.id ?? null,
    memberMessageShown: memberMessage ? `${memberMessage.title}\n\n${memberMessage.body}` : null,
    policyVersion: result.policyVersion,
  });

  if (!classification) return null;

  await insertAuditLog(supabase, {
    memberId: input.memberId,
    classificationId: classification.id,
    eventType: 'classification_created',
    actorType,
    actorId: input.actorId ?? null,
    policyVersion: result.policyVersion,
    summary: `Classified as ${result.classificationLevel} (${result.concernCategories.join(', ')}).`,
    metadata: { reasoningCodes: result.reasoningCodes, urgency: result.urgency },
  });

  if (memberMessage) {
    await insertAuditLog(supabase, {
      memberId: input.memberId,
      classificationId: classification.id,
      eventType: 'message_shown',
      actorType: 'system',
      policyVersion: result.policyVersion,
      summary: `Showed member message "${memberMessage.title}".`,
    });
  }

  let acknowledgmentId: string | null = null;
  if (result.acknowledgmentRequired && memberMessage) {
    const acknowledgment = await insertAcknowledgment(supabase, {
      classificationId: classification.id,
      memberId: input.memberId,
      messageShown: `${memberMessage.title}\n\n${memberMessage.body}`,
      messageVersion: String(template?.version ?? 1),
      classificationLevel: result.classificationLevel,
    });
    acknowledgmentId = acknowledgment?.id ?? null;
  }

  let reviewId: string | null = null;
  if (result.coachReviewRequired) {
    const assignedCoachId = await resolveAssignedCoach(supabase, input.memberId);
    const review = await insertReviewQueueEntry(supabase, {
      memberId: input.memberId,
      assignedCoachId,
      classificationId: classification.id,
      sourceFeature: input.sourceFeature,
      sourceRecordType: input.sourceRecordType ?? null,
      sourceRecordId: input.sourceRecordId ?? null,
      memberInputExcerpt: excerpt(input.text),
      concernCategories: result.concernCategories,
      classificationLevel: result.classificationLevel,
      urgency: result.urgency,
      restrictionsApplied: { restrictedTopics: result.restrictedTopics },
    });
    reviewId = review?.id ?? null;

    if (reviewId) {
      await insertAuditLog(supabase, {
        memberId: input.memberId,
        classificationId: classification.id,
        reviewId,
        eventType: 'review_created',
        actorType: 'system',
        policyVersion: result.policyVersion,
        summary: `Opened coach review queue entry (${result.classificationLevel}, urgency ${result.urgency}).`,
      });
    }
  }

  return { classification, result, memberMessage, acknowledgmentId, reviewId };
}
