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

import type { RegistryEntry } from '@mef/shared-types-contracts';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { resolveLocalDate } from './checkin';
import { listRegistryEntriesForMember } from '@/lib/registry/data';
import { getMemberRestrictedTopics } from '@/lib/feed/data';
import { computeMemberIntelligence, buildMemberIntelligence } from '@/lib/intelligence-engine/engine';
import type { MemberIntelligenceReport } from '@/lib/intelligence-engine/types';
import { computeDomainConfidence, type DomainConfidence } from '@/lib/investigation-engine/confidence';
import { COACHING_DOMAINS } from '@/lib/investigation-engine/domains';
import { decideNextAction, type RootRouterDecision } from '@/lib/investigation-engine/rootRouter';
import { classifyRouterOutcome, type RootRouterOutcomeView } from '@/lib/investigation-engine/routerOutcome';
import { buildRootMap, type RootMapView } from '@/lib/root-map';
import {
  listPendingReassessments,
  type PendingReassessmentRow,
} from '@/lib/reassessment-intelligence/data';

type SupabaseServerClient = ReturnType<typeof createClient>;

export async function localDateFor(supabase: SupabaseServerClient, userId: string): Promise<string> {
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

export type RootMapInputs = {
  activeFindings: RegistryEntry[];
  restrictedTopics: string[];
  decision: RootRouterDecision;
  report: MemberIntelligenceReport;
  domainConfidences: DomainConfidence[];
  routerOutcome: RootRouterOutcomeView;
};

/**
 * The shared, once-per-request gather step behind both the Root Map and
 * the Recommendation Engine (app/actions/recommendations.ts) — extracted
 * so a page rendering both never calls computeMemberIntelligence()/
 * decideNextAction() twice for the same member/request. Exported
 * specifically for that reuse; the Root Map's own shape (RootMapView)
 * stays this file's concern, the Recommendation Engine builds its own
 * output from the same inputs.
 */
export async function gatherRootMapInputs(
  supabase: SupabaseServerClient,
  memberId: string,
  localDate: string,
  coachView: boolean
): Promise<RootMapInputs> {
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

  return { activeFindings, restrictedTopics, decision, report, domainConfidences, routerOutcome };
}

async function assembleRootMap(
  supabase: SupabaseServerClient,
  memberId: string,
  localDate: string,
  coachView: boolean
): Promise<RootMapView> {
  const inputs = await gatherRootMapInputs(supabase, memberId, localDate, coachView);

  return buildRootMap({
    activeFindings: inputs.activeFindings,
    patterns: inputs.report.patterns,
    routerOutcome: inputs.routerOutcome,
    safetyGated: inputs.decision.safetyGated,
    restrictedTopics: inputs.restrictedTopics,
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
