/**
 * Safety Integration (section 10) — the Intelligence Engine never
 * diagnoses, never claims causation, and never bypasses Milestone 1's
 * safety/scope system. Two responsibilities:
 *
 *  1. Gate member-facing visibility: when the member currently has an
 *     open safety restriction (lib/safety/data.ts's real, live
 *     get_member_restricted_topics — the exact same check
 *     lib/feed/eligibility.ts's isContraindicated already relies on), the
 *     engine becomes more conservative about what it puts in front of the
 *     member directly, deferring to the coach instead.
 *  2. Route genuinely serious patterns into the EXISTING Coach Review
 *     Queue (safety_classifications + safety_review_queue) rather than
 *     inventing a second escalation path — reuses lib/safety/data.ts's
 *     insertClassification/insertReviewQueueEntry/insertAuditLog exactly,
 *     with source_feature 'wellness_intelligence' (added in migration 31,
 *     additive to the existing check constraint per migration 28's own
 *     "extend this list" comment).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SAFETY_POLICY_VERSION } from '../safety/policy';
import {
  insertClassification,
  insertReviewQueueEntry,
  insertAuditLog,
  resolveAssignedCoach,
} from '../safety/data';
import type { WellnessInsightDraft } from './types';

/**
 * Areas with a real, confident mapping to a specific restricted topic
 * (lib/safety/categories.ts's restrictedTopics vocabulary) — intentionally
 * small and honest rather than guessing a mapping for every area. Every
 * other area falls back to the blanket rule below.
 */
const AREA_TO_RESTRICTED_TOPICS: Partial<Record<string, string[]>> = {
  pain: ['pain_severity', 'urgent_symptom'],
  mood: ['self_harm'],
};

/**
 * Downgrades a draft to coach-only when it touches a currently-restricted
 * topic directly, or — as a conservative blanket rule — when the member
 * has ANY open restriction and this particular draft is high-severity.
 * Never upgrades or removes an existing safety restriction; only ever
 * makes the Intelligence Engine MORE conservative, never less.
 */
export function gateDraftForSafety(
  draft: WellnessInsightDraft,
  restrictedTopics: string[]
): WellnessInsightDraft {
  if (restrictedTopics.length === 0) return draft;

  const areaTopics = draft.wellnessArea
    ? (AREA_TO_RESTRICTED_TOPICS[draft.wellnessArea] ?? [])
    : [];
  const touchesRestrictedArea = areaTopics.some((topic) => restrictedTopics.includes(topic));
  const blanketDowngrade = draft.severity === 'important';

  if (!touchesRestrictedArea && !blanketDowngrade) return draft;

  return { ...draft, memberVisible: false };
}

const SERIOUS_TREND_STATES = new Set(['recurring_pattern']);
const MIN_SERIOUS_CONFIDENCE = 0.7;

/** True for a draft this module considers a "potentially serious pattern" per section 10 — important severity, a recurring (not fresh) pattern, and confident enough to act on. */
export function isSeriousPattern(draft: WellnessInsightDraft): boolean {
  return (
    draft.severity === 'important' &&
    draft.trendState !== null &&
    SERIOUS_TREND_STATES.has(draft.trendState) &&
    draft.confidence >= MIN_SERIOUS_CONFIDENCE
  );
}

/**
 * Opens (or reuses) a Coach Review Queue entry for a serious pattern —
 * returns the classification id so the caller can attach it to the
 * persisted wellness_insights row (same "compute the safety gate before
 * the row exists, then attach its id" order lib/feed/service.ts already
 * uses for daily_feed_items.safety_classification_id).
 */
export async function routeSeriousPatternToReview(
  supabase: SupabaseClient,
  memberId: string,
  draft: WellnessInsightDraft
): Promise<string | null> {
  const classification = await insertClassification(supabase, {
    memberId,
    sourceFeature: 'wellness_intelligence',
    sourceRecordType: 'wellness_insight_pattern',
    sourceRecordId: null,
    sourceEventId: null,
    inputExcerpt: draft.coachDetail,
    classificationLevel: 'coach_review_required',
    urgency: 'medium',
    concernCategories: [draft.patternKey],
    reasoningCodes: draft.reasoningCodes,
    coachingAllowed: true,
    coachingRestrictions: {},
    restrictedTopics: [],
    coachReviewRequired: true,
    acknowledgmentRequired: false,
    escalationAction: 'coach_review_queue',
    messageTemplateId: null,
    memberMessageShown: null,
    policyVersion: SAFETY_POLICY_VERSION,
  });
  if (!classification) return null;

  await insertAuditLog(supabase, {
    memberId,
    classificationId: classification.id,
    eventType: 'classification_created',
    actorType: 'system',
    policyVersion: SAFETY_POLICY_VERSION,
    summary: `Personal Wellness Intelligence Engine flagged a sustained pattern (${draft.patternKey}) for coach review.`,
    metadata: { reasoningCodes: draft.reasoningCodes, confidence: draft.confidence },
  });

  const assignedCoachId = await resolveAssignedCoach(supabase, memberId);
  const review = await insertReviewQueueEntry(supabase, {
    memberId,
    assignedCoachId,
    classificationId: classification.id,
    sourceFeature: 'wellness_intelligence',
    sourceRecordType: 'wellness_insight_pattern',
    sourceRecordId: null,
    memberInputExcerpt: draft.coachDetail,
    concernCategories: [draft.patternKey],
    classificationLevel: 'coach_review_required',
    urgency: 'medium',
    restrictionsApplied: {},
  });

  if (review) {
    await insertAuditLog(supabase, {
      memberId,
      classificationId: classification.id,
      reviewId: review.id,
      eventType: 'review_created',
      actorType: 'system',
      policyVersion: SAFETY_POLICY_VERSION,
      summary: `Opened coach review queue entry for a sustained wellness pattern (${draft.patternKey}).`,
    });
  }

  return classification.id;
}
