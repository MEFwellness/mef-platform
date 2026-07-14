/**
 * Wires the MEF Conversation Coach into the existing Coaching Safety,
 * Scope, and Human Oversight System (lib/safety/) — every member message
 * and every proposed coach_ai reply passes through the SAME
 * classifyConcern/evaluateConcern the rest of the app already uses.
 * Nothing here re-implements classification or invents a second safety
 * system; this file only adapts that system's inputs/outputs to a
 * conversation turn.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyConcern } from '@/lib/safety/classifier';
import { evaluateConcern, type SafetyEvaluationResult } from '@/lib/safety/service';
import { SAFETY_BLOCKED_REPLY_FALLBACK } from './fallback';

/** Every member-authored turn is classified and recorded — this is never skipped, matching section 8's "every member message... must pass through" requirement. */
export async function classifyMemberMessage(
  supabase: SupabaseClient,
  memberId: string,
  messageId: string,
  text: string
): Promise<SafetyEvaluationResult | null> {
  return evaluateConcern(supabase, {
    memberId,
    sourceFeature: 'conversation_coach',
    sourceRecordType: 'conversation_messages',
    sourceRecordId: messageId,
    text,
    actorType: 'member',
  });
}

export type GuardedReply = {
  text: string;
  blocked: boolean;
  safetyClassificationId: string | null;
};

/**
 * Defense-in-depth gate for a generated coach_ai reply, mirroring
 * lib/safety/outputGuard.ts's guardAgentOutputItem exactly: a free,
 * synchronous classifier check on every reply, and a DB-recorded
 * evaluateConcern only on the rare non-standard result. Returns the
 * reply unchanged in the common case, or a safe fallback string when the
 * generated text itself would cross a line the model should not have
 * crossed.
 */
export async function guardConversationReply(
  supabase: SupabaseClient,
  memberId: string,
  messageId: string,
  replyText: string
): Promise<GuardedReply> {
  const quickCheck = classifyConcern({ text: replyText });
  if (quickCheck.classificationLevel === 'standard_coaching') {
    return { text: replyText, blocked: false, safetyClassificationId: null };
  }

  const evaluation = await evaluateConcern(supabase, {
    memberId,
    sourceFeature: 'conversation_coach',
    sourceRecordType: 'conversation_messages',
    sourceRecordId: messageId,
    text: replyText,
    actorType: 'system',
  });

  if (!evaluation) {
    return { text: replyText, blocked: false, safetyClassificationId: null };
  }

  if (!evaluation.result.coachingAllowed) {
    const fallback = evaluation.memberMessage
      ? `${evaluation.memberMessage.title}\n\n${evaluation.memberMessage.body}`
      : SAFETY_BLOCKED_REPLY_FALLBACK;
    return { text: fallback, blocked: true, safetyClassificationId: evaluation.classification.id };
  }

  return { text: replyText, blocked: false, safetyClassificationId: evaluation.classification.id };
}
