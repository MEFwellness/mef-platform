'use server';

/**
 * The Recommendation Engine (Prompt 11) — member and coach entry points.
 * Ships strictly after the Root Router: reuses `gatherRootMapInputs()`
 * (app/actions/rootMap.ts) so a page rendering both the Root Map and
 * Recommendations never calls `computeMemberIntelligence()`/
 * `decideNextAction()` twice for the same request.
 */

import { createClient, getRequestClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { localDateFor, gatherRootMapInputs } from './rootMap';
import { listCoachAlertsForMember } from '@/lib/intelligence-engine/data';
import { recordRecommendationEvent, listRecommendationEventsForMember } from '@/lib/longitudinal-intelligence';
import {
  buildMemberRecommendations,
  upsertMemberRecommendation,
  listMemberRecommendations,
  completeRecommendation,
  ignoreRecommendation,
  deriveEffectiveStatus,
  describeForMember,
  summarizeOutcomeHistory,
  hasUnresolvedNegativeEvent,
  getRecommendationComputationState,
  markRecommendationsComputed,
  getLatestCheckinRecordedAt,
  isRecommendationComputationStale,
  retireSupersededCoachingFocus,
  isDailyCoachingFocus,
  onlyCurrentCoachingFocus,
  type MemberRecommendationCategory,
  type RecommendationLifecycleStatus,
  type MemberRecommendationRow,
  type RecommendationComputationTrigger,
} from '@/lib/recommendation-engine';

type SupabaseServerClient = ReturnType<typeof createClient>;

async function hasOpenMedicalEvaluationAlert(
  supabase: SupabaseServerClient,
  memberId: string
): Promise<boolean> {
  const alerts = await listCoachAlertsForMember(supabase, memberId, {
    statusFilter: ['open', 'acknowledged'],
  });
  return alerts.some((a) => a.alert_type === 'medical_evaluation_recommended');
}

/**
 * Runs the classifier + persists (upsert) — best-effort, non-throwing, same
 * posture as buildMemberIntelligence's own persistence. On success, also
 * marks member_recommendation_computations (migration 116) so page reads
 * know a fresh computation just happened and don't need to redo it — see
 * getMyRecommendationsWithFreshness below.
 */
async function recomputeAndPersist(
  supabase: SupabaseServerClient,
  memberId: string,
  localDate: string,
  coachView: boolean,
  trigger: RecommendationComputationTrigger
): Promise<void> {
  try {
    const [inputs, medicalFlag, existingRows, events] = await Promise.all([
      gatherRootMapInputs(supabase, memberId, localDate, coachView),
      hasOpenMedicalEvaluationAlert(supabase, memberId),
      listMemberRecommendations(supabase, memberId),
      listRecommendationEventsForMember(supabase, memberId),
    ]);

    // Prompt 12, Part 4 — real outcome history per category, and which
    // exact recommendation_key values carry an unresolved dismissed/
    // not-helpful event with no newer row (evidence) since.
    const categoryByRecommendationId = new Map(existingRows.map((r) => [r.id, r.category]));
    const outcomeHistory = summarizeOutcomeHistory(events, categoryByRecommendationId);

    const latestRowByKey = new Map<string, MemberRecommendationRow>();
    for (const row of existingRows) {
      const current = latestRowByKey.get(row.recommendationId);
      if (!current || row.createdAt > current.createdAt) latestRowByKey.set(row.recommendationId, row);
    }
    const suppressedRecommendationKeys = new Set(
      [...latestRowByKey.values()]
        .filter((row) => hasUnresolvedNegativeEvent(row.id, events))
        .map((row) => row.recommendationId)
    );

    const built = buildMemberRecommendations({
      recommendations: inputs.report.recommendations,
      routerOutcome: inputs.routerOutcome,
      isCoachAttentionPriority: inputs.report.priorities.recommendedCoachAttentionLevel === 'priority',
      restrictedTopics: inputs.restrictedTopics,
      hasOpenMedicalEvaluationAlert: medicalFlag,
      outcomeHistory,
      suppressedRecommendationKeys,
    });

    // Independent rows (each keyed by its own recommendation_key) — no
    // reason for these to wait on each other one at a time.
    await Promise.all(built.map((rec) => upsertMemberRecommendation(supabase, memberId, rec)));

    // The daily coaching focus is rewritten every run, and its dedup key
    // contains the focus label, so yesterday's focus never collided with
    // today's and simply stayed live. Retire the ones this run replaced,
    // now that this run's own row exists.
    await retireSupersededCoachingFocus(
      supabase,
      memberId,
      built.find(isDailyCoachingFocus)?.recommendationId ?? null
    );

    await markRecommendationsComputed(supabase, memberId, trigger);
  } catch (err) {
    console.error('recomputeAndPersist (recommendations) failed', err instanceof Error ? err.message : err);
  }
}

/**
 * Best-effort trigger — recomputes and persists this member's full
 * recommendation set right now, tagging why. Called after the three real
 * data-changing events that materially feed this engine: a completed
 * check-in (app/actions/checkin.ts's submitDailyCheckin), a coach
 * publishing an assessment report (lib/health-profile/orchestration.ts's
 * onAssessmentPublished), and a completed questionnaire
 * (app/actions/assessments.ts's completeMyAssessment). Same "never allowed
 * to affect the action that triggered it" discipline as every other
 * best-effort recompute in this app (Root Score after check-in,
 * recalculateIntelligenceCore after assessment publish) — recomputeAndPersist
 * already swallows its own errors, so a caller never needs its own
 * try/catch around this.
 */
export async function recomputeMyRecommendations(
  supabase: SupabaseServerClient,
  memberId: string,
  localDate: string,
  trigger: RecommendationComputationTrigger
): Promise<void> {
  await recomputeAndPersist(supabase, memberId, localDate, false, trigger);
}

export type MemberRecommendationView = {
  /** The real DB row id — required for markRecommendationDone/markRecommendationNotHelpful. */
  rowId: string;
  category: MemberRecommendationCategory;
  categoryLabel: string;
  title: string;
  explanation: string;
  completionTracking: boolean;
  status: RecommendationLifecycleStatus;
};

function toView(row: MemberRecommendationRow, asOfDate: Date): MemberRecommendationView {
  const { categoryLabel, title, explanation, completionTracking } = describeForMember(row);
  return {
    rowId: row.id,
    category: row.category,
    categoryLabel,
    title,
    explanation,
    completionTracking,
    status: deriveEffectiveStatus(row, asOfDate),
  };
}

async function readMyRecommendationRows(
  supabase: SupabaseServerClient,
  memberId: string
): Promise<MemberRecommendationView[]> {
  const rows = await listMemberRecommendations(supabase, memberId, { statusFilter: ['shown'] });
  return onlyCurrentCoachingFocus(rows)
    .map((row) => toView(row, new Date()))
    .filter((view) => view.status !== 'expired');
}

export type MemberRecommendationsWithFreshness = {
  recommendations: MemberRecommendationView[];
  /**
   * True when a newer check-in exists than the stored result's own
   * computed-at timestamp — the eager recompute at check-in/assessment-
   * publish/questionnaire-completion (recomputeMyRecommendations) should
   * already have refreshed this, so a stale read here means that
   * best-effort step hasn't run yet or failed. `recommendations` is still
   * the real stored result, safe to render immediately; the caller is
   * expected to call refreshMyRecommendations() and swap in the result
   * once it resolves, rather than block the page on it.
   */
  isStale: boolean;
};

/**
 * The one place both /progress and the Dashboard's RecommendationsCard
 * (and the dedicated /recommendations page) read from — same stored
 * result, same staleness rule, so they can never show a member two
 * different recommendation sets at the same moment. Reads the persisted
 * member_recommendations rows directly; only computes live (blocking) the
 * first time ever for a member who has no stored result yet. A stale-but-
 * present result is returned as-is (fast) with `isStale: true` — see
 * refreshMyRecommendations for the follow-up recompute.
 */
export async function getMyRecommendationsWithFreshness(): Promise<MemberRecommendationsWithFreshness> {
  const supabase = getRequestClient();
  const user = await getCachedUser();
  if (!user) return { recommendations: [], isStale: false };

  const localDate = await localDateFor(supabase, user.id);
  const [state, latestCheckinAt] = await Promise.all([
    getRecommendationComputationState(supabase, user.id),
    getLatestCheckinRecordedAt(supabase, user.id),
  ]);

  if (!state) {
    // First-ever visit with nothing stored: compute live (the caller's own
    // Suspense boundary is the "skeleton" while this resolves), then read.
    await recomputeAndPersist(supabase, user.id, localDate, false, 'manual');
    return { recommendations: await readMyRecommendationRows(supabase, user.id), isStale: false };
  }

  return {
    recommendations: await readMyRecommendationRows(supabase, user.id),
    isStale: isRecommendationComputationStale(state, latestCheckinAt),
  };
}

/** Read-only convenience wrapper for callers that don't need the staleness flag. */
export async function getMyRecommendations(): Promise<MemberRecommendationView[]> {
  return (await getMyRecommendationsWithFreshness()).recommendations;
}

/**
 * Called by the client once getMyRecommendationsWithFreshness reports
 * `isStale: true` — actually recomputes (same engine, same output shape
 * proven identical to the live path by construction: it's the same
 * function) and returns the fresh result for the client to swap in.
 */
export async function refreshMyRecommendations(): Promise<MemberRecommendationView[]> {
  const supabase = getRequestClient();
  const user = await getCachedUser();
  if (!user) return [];

  const localDate = await localDateFor(supabase, user.id);
  await recomputeAndPersist(supabase, user.id, localDate, false, 'manual');
  return readMyRecommendationRows(supabase, user.id);
}

export type CoachMemberRecommendationView = MemberRecommendationView & {
  whyThisWasSelected: string;
  supportingFindings: string[];
  confidence: number;
  priority: MemberRecommendationRow['priority'];
};

export async function getClientRecommendations(clientId: string): Promise<CoachMemberRecommendationView[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];

  const localDate = await localDateFor(supabase, clientId);
  await recomputeAndPersist(supabase, clientId, localDate, true, 'manual');

  const rows = await listMemberRecommendations(supabase, clientId);
  const now = new Date();
  return rows.map((row) => ({
    ...toView(row, now),
    whyThisWasSelected: row.whyThisWasSelected,
    supportingFindings: row.supportingFindings,
    confidence: row.confidence,
    priority: row.priority,
  }));
}

export async function markRecommendationDone(rowId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };

  const ok = await completeRecommendation(supabase, rowId, user.id);
  return ok ? {} : { error: 'Could not update this recommendation.' };
}

export async function markRecommendationNotHelpful(rowId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };

  const ok = await ignoreRecommendation(supabase, rowId, user.id);
  if (ok) await recordRecommendationEvent(supabase, user.id, rowId, 'marked_not_helpful');
  return ok ? {} : { error: 'Could not update this recommendation.' };
}
