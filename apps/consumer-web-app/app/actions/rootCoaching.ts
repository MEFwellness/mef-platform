'use server';

/**
 * Root Coaching Conversation Engine — server entry point (Prompt 13). Gathers
 * already-computed inputs from every engine this composes (the Root
 * Map/Router's own shared gather step, Longitudinal Intelligence, Lifestyle
 * Experiments, the Recommendation Engine's event history) and hands them to
 * the pure planCoachingConversation() orchestrator
 * (lib/root-coaching-engine/service.ts). Nothing here re-decides a signal,
 * a next investigation, or a recommendation — this file only gathers and
 * persists. Same session-scoped-client, RLS-is-the-boundary discipline as
 * every other action file in this family (recommendations.ts, rootMap.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { localDateFor, gatherRootMapInputs } from './rootMap';
import { computeLongitudinalSignals, listRecommendationEventsForMember } from '@/lib/longitudinal-intelligence';
import { listMyLifestyleExperiments } from '@/lib/lifestyle-experiments';
import { listMemberRecommendations } from '@/lib/recommendation-engine';
import { getCoachingSafetyGate } from '@/lib/coaching-insights/safety';
import {
  buildMemberEngagementProfile,
  listRecentCoachingMessages,
  planCoachingConversation,
  recordCoachingMessage,
  type CoachingConversationPlan,
  type CoachingMessageRow,
  type CoachingMessageView,
  type CoachWorkspaceSummary,
} from '@/lib/root-coaching-engine';

type GatherAndPlanResult = {
  plan: CoachingConversationPlan;
  recentMessages: CoachingMessageRow[];
  localDate: string;
};

/**
 * The shared gather-and-plan step behind both the member's own message and
 * the coach's workspace summary — same "compute once, two callers" pattern
 * app/actions/rootMap.ts's own gatherRootMapInputs already established.
 * Returns null when a safety gate is active — safety always overrides
 * coaching, and the approved safety copy is already shown to the member
 * elsewhere (no separate message here).
 */
async function gatherAndPlan(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  coachView: boolean
): Promise<GatherAndPlanResult | null> {
  const [rootMapInputs, signals, experiments, recommendationRows, events, recentMessages, safetyGate] =
    await Promise.all([
      gatherRootMapInputs(supabase, memberId, localDate, coachView),
      computeLongitudinalSignals(supabase, memberId, localDate),
      listMyLifestyleExperiments(supabase, memberId),
      listMemberRecommendations(supabase, memberId),
      listRecommendationEventsForMember(supabase, memberId),
      listRecentCoachingMessages(supabase, memberId),
      getCoachingSafetyGate(supabase, memberId),
    ]);

  if (safetyGate.suppressAll || rootMapInputs.decision.safetyGated) return null;

  const engagementProfile = buildMemberEngagementProfile({
    recommendationRows,
    events,
    experiments,
    asOfDate: new Date(localDate),
  });

  // Same posture lib/coaching-insights/safety.ts already takes for
  // food_lens-sourced statements: a member with an active nutrition safety
  // override never gets a nutrition-domain topic freshly introduced, but
  // isn't silenced entirely.
  const signalsForSelection = safetyGate.suppressNutrition
    ? signals.filter((s) => !(s.signalKind === 'registry_finding' && s.signalKey.includes('::nutrition::')))
    : signals;

  const plan = planCoachingConversation({
    signals: signalsForSelection,
    routerOutcome: rootMapInputs.routerOutcome,
    experiments,
    engagementProfile,
    recentMessages,
    asOfLocalDate: localDate,
  });

  return { plan, recentMessages, localDate };
}

/**
 * Member-facing — today's coaching message, if any. Only inserts a new
 * memory-layer row the first time this exact topic is chosen on a given
 * day (checked against the same recentMessages the selector itself just
 * ranked against) — a reload, a Next.js prefetch, or any other same-day
 * re-render resolves to the identical already-recorded message instead of
 * either duplicating the row or silently going blank.
 */
export async function getMyCoachingMessage(): Promise<CoachingMessageView | null> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return null;

  const localDate = await localDateFor(supabase, user.id);
  const result = await gatherAndPlan(supabase, user.id, localDate, false);
  const chosenCandidate = result?.plan.chosenCandidate;
  const message = result?.plan.message;
  if (!chosenCandidate || !message) return null;
  const { recentMessages } = result;

  const alreadyRecordedToday = recentMessages.some(
    (m) => m.topicKey === chosenCandidate.topicKey && m.shownAt.slice(0, 10) === localDate
  );
  if (!alreadyRecordedToday) {
    await recordCoachingMessage(supabase, user.id, {
      topicKey: chosenCandidate.topicKey,
      conversationType: chosenCandidate.conversationType,
      messageText: message.coachingCard,
      sourceState: chosenCandidate.sourceState,
    });
  }

  return message;
}

/** Coach-only — the Coach Workspace's conversation summary, priorities, recent themes, and suggested discussion topics/questions. Never recorded as a message shown to the member; the coach is only reading, not delivering. */
export async function getClientCoachWorkspaceSummary(clientId: string): Promise<CoachWorkspaceSummary | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const localDate = await localDateFor(supabase, clientId);
  const result = await gatherAndPlan(supabase, clientId, localDate, true);
  return result?.plan.workspaceSummary ?? null;
}
