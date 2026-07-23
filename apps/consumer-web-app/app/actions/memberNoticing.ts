'use server';

/**
 * Member Experience — "What We're Noticing" (Prompt 6). The member's own
 * view over their own active, member-visible Universal Registry findings —
 * RLS (migration 40's member_read_own_registry_entries) is what actually
 * restricts this to member_visible=true, status='active' rows; this
 * action makes no additional visibility decision of its own.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { listRegistryEntriesForMember } from '@/lib/registry/data';
import { suggestAssessmentsFromFindings } from '@/lib/assessment-registry/findingRecommendations';
import {
  buildMemberFacingNoticing,
  type MemberNoticingView,
} from '@/lib/intelligence-engine/memberFacingNoticing';
import {
  decideNextAction,
  describeRecommendation,
  type RecommendedInvestigationView,
} from '@/lib/investigation-engine/rootRouter';

export type MemberNoticingViewWithRecommendation = MemberNoticingView & {
  /** The Root Router's single next-step pick (Investigation Engine, Prompt 9) — null when nothing is actionable or the member is currently safety-gated. */
  recommendedInvestigation: RecommendedInvestigationView | null;
};

export async function getMyNoticingView(): Promise<MemberNoticingViewWithRecommendation | null> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return null;

  const entries = await listRegistryEntriesForMember(supabase, user.id);
  const activeFindings = entries.filter((e) => e.status === 'active' && e.entry_kind === 'finding');
  const suggestions = suggestAssessmentsFromFindings(activeFindings);
  const noticing = buildMemberFacingNoticing(entries, suggestions);

  const routerDecision = await decideNextAction(supabase, user.id);

  return { ...noticing, recommendedInvestigation: describeRecommendation(routerDecision) };
}
