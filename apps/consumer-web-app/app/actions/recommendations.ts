'use server';

/**
 * The Recommendation Engine (Prompt 11) — member and coach entry points.
 * Ships strictly after the Root Router: reuses `gatherRootMapInputs()`
 * (app/actions/rootMap.ts) so a page rendering both the Root Map and
 * Recommendations never calls `computeMemberIntelligence()`/
 * `decideNextAction()` twice for the same request.
 */

import { createClient } from '@/lib/supabase/server';
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
  type MemberRecommendationCategory,
  type RecommendationLifecycleStatus,
  type MemberRecommendationRow,
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

/** Runs the classifier + persists (upsert) — best-effort, non-throwing, same posture as buildMemberIntelligence's own persistence. */
async function recomputeAndPersist(
  supabase: SupabaseServerClient,
  memberId: string,
  localDate: string,
  coachView: boolean
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

    for (const rec of built) {
      await upsertMemberRecommendation(supabase, memberId, rec);
    }
  } catch (err) {
    console.error('recomputeAndPersist (recommendations) failed', err instanceof Error ? err.message : err);
  }
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

export async function getMyRecommendations(): Promise<MemberRecommendationView[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];

  const localDate = await localDateFor(supabase, user.id);
  await recomputeAndPersist(supabase, user.id, localDate, false);

  const rows = await listMemberRecommendations(supabase, user.id, { statusFilter: ['shown'] });
  return rows.map((row) => toView(row, new Date())).filter((view) => view.status !== 'expired');
}

export type CoachMemberRecommendationView = MemberRecommendationView & {
  whyThisWasSelected: string;
  supportingFindings: string[];
  confidence: number;
  priority: MemberRecommendationRow['priority'];
};

export async function getClientRecommendations(clientId: string): Promise<CoachMemberRecommendationView[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const localDate = await localDateFor(supabase, clientId);
  await recomputeAndPersist(supabase, clientId, localDate, true);

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
