'use server';

/**
 * Member Root Map (Prompt 10) — the first production, member-facing Root
 * Map (Root Model and Router §16 closing recommendation 6). Computed live
 * from data every other Investigation Engine / Intelligence Engine module
 * already produces; nothing here is persisted. Member and coach variants
 * share the same builder (lib/root-map/) — the coach variant additionally
 * surfaces safety flags, pending reassessments, and recent Root Router
 * decisions a member should never see about themselves in that form.
 *
 * Uses computeMemberIntelligence() (read-only, no persistence side effect)
 * for the member variant so viewing your own Root Map never writes an
 * intelligence snapshot or upserts a coach alert as a side effect — the
 * same distinction lib/intelligence-engine/engine.ts's own docblock draws
 * between it and buildMemberIntelligence(), which the coach variant uses
 * (matching every other panel on the coach client page).
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { resolveLocalDate } from './checkin';
import { listRegistryEntriesForMember } from '@/lib/registry/data';
import { getMemberRestrictedTopics } from '@/lib/feed/data';
import { computeMemberIntelligence, buildMemberIntelligence } from '@/lib/intelligence-engine/engine';
import { computeDomainConfidence } from '@/lib/investigation-engine/confidence';
import { COACHING_DOMAINS } from '@/lib/investigation-engine/domains';
import { decideNextAction } from '@/lib/investigation-engine/rootRouter';
import { classifyRouterOutcome } from '@/lib/investigation-engine/routerOutcome';
import { buildRootMap, type RootMapView } from '@/lib/root-map';
import {
  listPendingReassessments,
  type PendingReassessmentRow,
} from '@/lib/reassessment-intelligence/data';

type SupabaseServerClient = ReturnType<typeof createClient>;

async function localDateFor(supabase: SupabaseServerClient, userId: string): Promise<string> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single();
  const timezone = profile?.timezone ?? 'America/New_York';
  return resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );
}

async function assembleRootMap(
  supabase: SupabaseServerClient,
  memberId: string,
  localDate: string,
  coachView: boolean
): Promise<RootMapView> {
  const [activeFindings, restrictedTopics, decision, report] = await Promise.all([
    listRegistryEntriesForMember(supabase, memberId, { statusFilter: ['active'] }),
    getMemberRestrictedTopics(supabase, memberId),
    decideNextAction(supabase, memberId),
    coachView
      ? buildMemberIntelligence(supabase, memberId, localDate)
      : computeMemberIntelligence(supabase, memberId, localDate),
  ]);

  const domainConfidences = COACHING_DOMAINS.map((d) =>
    computeDomainConfidence(d.domain, activeFindings)
  );
  const routerOutcome = classifyRouterOutcome(
    decision,
    report.priorities.recommendedCoachAttentionLevel,
    report.recommendations,
    domainConfidences
  );

  return buildRootMap({
    activeFindings,
    patterns: report.patterns,
    routerOutcome,
    safetyGated: decision.safetyGated,
    restrictedTopics,
    coachView,
  });
}

export async function getMyRootMap(): Promise<RootMapView | null> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return null;

  const localDate = await localDateFor(supabase, user.id);
  return assembleRootMap(supabase, user.id, localDate, false);
}

export type RouterDecisionRow = {
  recommendedKey: string;
  recommendedReason: string;
  chosenKey: string | null;
  decidedAt: string;
};

/** Coach-only — the last 10 logged Root Router decisions for this member (member_agency honesty log, migration 89/90). */
async function listRecentRouterDecisions(
  supabase: SupabaseServerClient,
  memberId: string
): Promise<RouterDecisionRow[]> {
  const { data, error } = await supabase
    .from('investigation_router_decisions')
    .select('recommended_key, recommended_reason, chosen_key, decided_at')
    .eq('member_id', memberId)
    .order('decided_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('listRecentRouterDecisions failed', error);
    return [];
  }

  return (
    (data ?? []) as {
      recommended_key: string;
      recommended_reason: string;
      chosen_key: string | null;
      decided_at: string;
    }[]
  ).map((row) => ({
    recommendedKey: row.recommended_key,
    recommendedReason: row.recommended_reason,
    chosenKey: row.chosen_key,
    decidedAt: row.decided_at,
  }));
}

export type CoachRootMapView = RootMapView & {
  pendingReassessments: PendingReassessmentRow[];
  recentRouterDecisions: RouterDecisionRow[];
};

export async function getClientRootMap(clientId: string): Promise<CoachRootMapView | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const localDate = await localDateFor(supabase, clientId);
  const [view, pendingReassessments, recentRouterDecisions] = await Promise.all([
    assembleRootMap(supabase, clientId, localDate, true),
    listPendingReassessments(supabase, clientId),
    listRecentRouterDecisions(supabase, clientId),
  ]);

  return { ...view, pendingReassessments, recentRouterDecisions };
}
