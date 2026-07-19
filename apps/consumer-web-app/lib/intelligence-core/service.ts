/**
 * The MEF Wellness Intelligence Core's orchestrator (Milestone 9). Two
 * entry points:
 *
 *   recalculateIntelligenceCore()   the write path — reads the MEF
 *                                    Intelligence Engine's report plus
 *                                    Conversation Coach memory, derives
 *                                    identity observations / profile
 *                                    dimensions / a coaching style /
 *                                    recommendation-suppression state, and
 *                                    persists all four with proper
 *                                    lifecycle transitions (insert / touch
 *                                    / supersede / resolve). Called after
 *                                    every check-in, assessment,
 *                                    conversation turn, coach note, habit
 *                                    completion, and lesson completion —
 *                                    see the call sites in
 *                                    lib/ai/dispatcher.ts,
 *                                    lib/conversation-coach/service.ts, and
 *                                    lib/feed/service.ts. Best-effort and
 *                                    non-throwing, same discipline as
 *                                    lib/narrative/service.ts's
 *                                    updateNarrativeForEvent and
 *                                    lib/intelligence-engine/engine.ts's
 *                                    buildMemberIntelligence.
 *
 *   getIntelligenceCoreSummary()    the read path — the Coach Dashboard's
 *                                    "Intelligence Summary." Reads the
 *                                    already-persisted identity/dimension/
 *                                    style rows (so trend_direction and
 *                                    evidence_count reflect real history,
 *                                    not a single fresh computation) and
 *                                    combines them with a live, cheap
 *                                    MemberIntelligenceReport for
 *                                    recommendations/hypotheses/summary —
 *                                    same "persisted claims + live report"
 *                                    split the coach client page already
 *                                    uses across IntelligencePanel and
 *                                    MemberIntelligencePanel.
 *
 * FUTURE READY: every derivation below reads MemberHealthProfile
 * (lib/intelligence-engine/profile.ts) plus Conversation Coach memory and
 * Daily Feed history — all first-party. A future wearable/lab-work/body-
 * scan integration only needs to extend MemberHealthProfile with its own
 * new field (the same place baseline/reassessment/feed/narrative data
 * already gets assembled once) and add a new deriveX()/dimensionFromArea()
 * call here; nothing about the persistence model, lifecycle logic, or the
 * consumers of this module (Conversation Coach, Coach Dashboard, member
 * surfaces) needs to change.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WellnessIdentityObservation } from '@mef/shared-types-contracts';
import { gatherMemberHealthProfile } from '../intelligence-engine/profile';
import {
  computeIntelligenceFromProfile,
  computeMemberIntelligence,
} from '../intelligence-engine/engine';
import { listActiveMemory } from '../conversation-coach/data';
import { deriveAllIdentityObservationDrafts } from './observations';
import { computeAllProfileDimensions, computeCoachingStyleDimension } from './dimensions';
import { computeCoachingStyle } from './coachingStyle';
import { prioritizeRecommendations } from './prioritization';
import { guardRecommendations } from './recommendationGuard';
import {
  findActiveIdentityObservationByKey,
  getCoachingStyleProfile,
  insertIdentityObservation,
  listIdentityObservationsForMember,
  listProfileDimensionsForMember,
  listRecommendationFeedback,
  resolveIdentityObservation,
  supersedeIdentityObservation,
  touchIdentityObservationObserved,
  upsertCoachingStyleProfile,
  upsertProfileDimension,
  upsertRecommendationFeedback,
} from './data';
import type {
  CoachingStyleComputation,
  IntelligenceCoreSummary,
  WellnessIdentityObservationDraft,
} from './types';
import { CONFIDENCE_TOUCH_TOLERANCE } from './thresholds';
import { toMemberWellnessHighlights } from './memberView';

/** Domains whose statements read as physical-symptom correlations — downgraded to coach-only (never dropped) while any topic is currently restricted for this member, same "downgrade, never silently assert" discipline as wellness_insights' safety gate (lib/intelligence/safety.ts). */
const SAFETY_SENSITIVE_DOMAINS = new Set([
  'pain_correlation',
  'sleep_correlation',
  'movement_response',
]);

function applySafetyGate(
  draft: WellnessIdentityObservationDraft,
  restrictedTopics: string[]
): WellnessIdentityObservationDraft {
  if (restrictedTopics.length === 0) return draft;
  if (!SAFETY_SENSITIVE_DOMAINS.has(draft.domain)) return draft;
  return { ...draft, memberVisible: false };
}

async function upsertObservation(
  supabase: SupabaseClient,
  memberId: string,
  draft: WellnessIdentityObservationDraft
): Promise<void> {
  const existing = await findActiveIdentityObservationByKey(
    supabase,
    memberId,
    draft.observationKey
  );

  if (!existing) {
    await insertIdentityObservation(supabase, memberId, draft);
    return;
  }

  if (existing.statement === draft.statement) {
    const delta = draft.confidence - existing.confidence;
    const trendDirection =
      delta >= CONFIDENCE_TOUCH_TOLERANCE
        ? 'strengthening'
        : delta <= -CONFIDENCE_TOUCH_TOLERANCE
          ? 'weakening'
          : 'stable';
    await touchIdentityObservationObserved(supabase, existing.id, {
      evidenceCount: draft.evidenceCount,
      confidence: draft.confidence,
      trendDirection,
    });
    return;
  }

  const inserted = await insertIdentityObservation(supabase, memberId, draft, {
    supersedesId: existing.id,
    firstObservedAt: existing.first_observed_at,
  });
  if (inserted) {
    await supersedeIdentityObservation(supabase, existing.id, inserted.id);
  }
}

async function resolveStaleObservations(
  supabase: SupabaseClient,
  memberId: string,
  activeObservations: WellnessIdentityObservation[],
  currentKeys: Set<string>
): Promise<void> {
  const stale = activeObservations.filter((o) => !currentKeys.has(o.observation_key));
  for (const observation of stale) {
    await resolveIdentityObservation(supabase, observation.id);
  }
}

export async function recalculateIntelligenceCore(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<void> {
  try {
    const profile = await gatherMemberHealthProfile(supabase, memberId, asOfLocalDate);
    const report = computeIntelligenceFromProfile(profile);
    const conversationMemory = await listActiveMemory(supabase, memberId);

    const drafts = deriveAllIdentityObservationDrafts(profile, report, conversationMemory).map(
      (draft) => applySafetyGate(draft, profile.restrictedTopics)
    );

    const activeObservations = await listIdentityObservationsForMember(supabase, memberId, {
      statusFilter: ['active'],
    });
    await resolveStaleObservations(
      supabase,
      memberId,
      activeObservations,
      new Set(drafts.map((d) => d.observationKey))
    );
    for (const draft of drafts) {
      await upsertObservation(supabase, memberId, draft);
    }

    const dimensions = computeAllProfileDimensions(profile, report);
    for (const dimension of dimensions) {
      await upsertProfileDimension(supabase, memberId, dimension);
    }

    const timeCommitmentDraft =
      drafts.find((d) => d.observationKey === 'time_commitment_short_content_preference') ?? null;
    const style = computeCoachingStyle(
      profile.feedHistoryPairs,
      profile.narrativeItems,
      conversationMemory,
      timeCommitmentDraft
    );
    await upsertCoachingStyleProfile(supabase, memberId, style);
    await upsertProfileDimension(supabase, memberId, computeCoachingStyleDimension(style));

    const existingFeedback = await listRecommendationFeedback(supabase, memberId);
    const { feedbackUpdates } = guardRecommendations(report.recommendations, existingFeedback);
    await upsertRecommendationFeedback(supabase, memberId, feedbackUpdates);
  } catch (err) {
    console.error('recalculateIntelligenceCore failed', err instanceof Error ? err.message : err);
  }
}

const DEFAULT_COACHING_STYLE: CoachingStyleComputation = {
  tonePreference: 'unclear',
  detailPreference: 'unclear',
  taskLoadPreference: 'unclear',
  timeCommitmentSweetSpotMinutes: null,
  confidence: 0,
  evidenceCount: 0,
  rationale: 'Not enough interaction history yet to infer a coaching style preference.',
};

export async function getIntelligenceCoreSummary(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<IntelligenceCoreSummary> {
  const report = await computeMemberIntelligence(supabase, memberId, asOfLocalDate);

  const [activeObservations, profileDimensions, coachingStyleRow, existingFeedback] =
    await Promise.all([
      listIdentityObservationsForMember(supabase, memberId, { statusFilter: ['active'] }),
      listProfileDimensionsForMember(supabase, memberId),
      getCoachingStyleProfile(supabase, memberId),
      listRecommendationFeedback(supabase, memberId),
    ]);

  const { surfaced } = guardRecommendations(report.recommendations, existingFeedback);
  const prioritization = prioritizeRecommendations(surfaced);

  const coachingStyle: CoachingStyleComputation = coachingStyleRow
    ? {
        tonePreference: coachingStyleRow.tone_preference,
        detailPreference: coachingStyleRow.detail_preference,
        taskLoadPreference: coachingStyleRow.task_load_preference,
        timeCommitmentSweetSpotMinutes: coachingStyleRow.time_commitment_sweet_spot_minutes,
        confidence: coachingStyleRow.confidence,
        evidenceCount: coachingStyleRow.evidence_count,
        rationale: coachingStyleRow.rationale,
      }
    : DEFAULT_COACHING_STYLE;

  const strongDimensions = profileDimensions
    .filter((d) => d.level === 'high' || d.level === 'very_high')
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3)
    .map((d) => ({
      title: `${d.dimension.replace(/_/g, ' ')}`,
      detail: d.rationale,
      confidence: d.confidence,
    }));

  const weakDimensions = profileDimensions
    .filter((d) => d.level === 'low' || d.level === 'very_low')
    .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))
    .slice(0, 3)
    .map((d) => ({
      title: `${d.dimension.replace(/_/g, ' ')}`,
      detail: d.rationale,
      confidence: d.confidence,
    }));

  const emergingConcerns = report.patterns
    .filter((p) => p.kind === 'burnout_signal' || p.kind === 'lifestyle_disruption')
    .map((p) => p.description);

  const decliningTrend = report.longitudinalTrends.find((t) => t.direction === 'declining');
  const improvingTrend = report.longitudinalTrends.find((t) => t.direction === 'improving');
  const longTermTrendSummary = decliningTrend
    ? `${decliningTrend.area} has been declining recently.`
    : improvingTrend
      ? `${improvingTrend.area} has been improving recently.`
      : null;

  return {
    memberId,
    localDate: asOfLocalDate,
    generatedAt: new Date().toISOString(),
    topStrengths: strongDimensions,
    biggestOpportunities: weakDimensions,
    emergingConcerns,
    recentWins: report.memberSummary.recentWins,
    longTermTrendSummary,
    motivationProfile: report.memberSummary.currentMotivation,
    currentCoachingStrategy: report.memberSummary.currentCoachingStyle,
    prioritization,
    identityObservations: activeObservations.map((o) => ({
      id: o.id,
      domain: o.domain,
      statement: o.statement,
      coachDetail: o.coach_detail,
      confidence: o.confidence,
      evidenceCount: o.evidence_count,
      trendDirection: o.trend_direction,
    })),
    profileDimensions: profileDimensions.map((d) => ({
      dimension: d.dimension,
      level: d.level,
      score: d.score,
      confidence: d.confidence,
      trendDirection: d.trend_direction,
      evidenceCount: d.evidence_count,
      rationale: d.rationale,
      contributingEvidence: d.contributing_evidence,
    })),
    coachingStyle,
    recommendations: surfaced,
  };
}

/** Internal-only phrasing for the Conversation Coach's system prompt — steers tone/length/structure, never shown verbatim to the member (see lib/conversation-coach/prompt.ts). Returns null below a confidence floor so an unclear style never falsely constrains a reply. */
function coachingStyleGuidanceText(style: CoachingStyleComputation): string | null {
  if (style.confidence < 0.5) return null;
  const parts: string[] = [];

  if (style.tonePreference === 'encouragement') {
    parts.push('Lean encouraging and warm rather than purely instructional.');
  } else if (style.tonePreference === 'direct') {
    parts.push('Be direct and concise rather than softening with extra framing.');
  } else if (style.tonePreference === 'education_first') {
    parts.push('Briefly explain the "why" before the suggestion.');
  }

  if (style.detailPreference === 'brief') {
    parts.push('Keep replies short.');
  } else if (style.detailPreference === 'detailed') {
    parts.push('A bit more explanation is welcome here.');
  }

  if (style.taskLoadPreference === 'single_focus') {
    parts.push('Suggest only one thing at a time — do not stack multiple asks.');
  }

  if (style.timeCommitmentSweetSpotMinutes !== null) {
    parts.push(
      `Prefer suggestions that take about ${style.timeCommitmentSweetSpotMinutes} minutes or less.`
    );
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * The one call the Conversation Coach makes for this layer's additions
 * (lib/conversation-coach/context.ts) — mirrors
 * getConversationContextIntelligence's own "single call, read-only, cheap"
 * posture one layer down. Reads only already-persisted, already
 * member-visibility-filtered rows (toMemberWellnessHighlights applies the
 * same confidence floor and positive framing the member's own "Your
 * Wellness Identity" surface uses), so a reply can safely reference these
 * statements directly — they're never coach-only or safety-gated content
 * leaking into a member-facing reply.
 */
export async function getConversationCoachingContext(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ identityHighlights: string[]; coachingStyleGuidance: string | null }> {
  const [observations, styleRow] = await Promise.all([
    listIdentityObservationsForMember(supabase, memberId, { statusFilter: ['active'] }),
    getCoachingStyleProfile(supabase, memberId),
  ]);

  const identityHighlights = toMemberWellnessHighlights(observations).map((h) => h.statement);
  const style: CoachingStyleComputation = styleRow
    ? {
        tonePreference: styleRow.tone_preference,
        detailPreference: styleRow.detail_preference,
        taskLoadPreference: styleRow.task_load_preference,
        timeCommitmentSweetSpotMinutes: styleRow.time_commitment_sweet_spot_minutes,
        confidence: styleRow.confidence,
        evidenceCount: styleRow.evidence_count,
        rationale: styleRow.rationale,
      }
    : DEFAULT_COACHING_STYLE;

  return { identityHighlights, coachingStyleGuidance: coachingStyleGuidanceText(style) };
}
