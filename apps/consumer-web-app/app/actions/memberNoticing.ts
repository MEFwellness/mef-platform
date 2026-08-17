'use server';

/**
 * Member Experience — "What We're Noticing".
 *
 * MIGRATED to the Member Interpretation Layer (2026-08-17): this action no
 * longer reads registry rows and no longer decides what any of them mean.
 * It asks the layer for the member's canonical findings and hands them to
 * the screen's own reshape.
 *
 * The Root Router's single next-step pick is unchanged and still comes from
 * the Root Router, which is the one system that decides it.
 */

import { getRequestClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import {
  buildMemberFacingNoticing,
  type MemberNoticingView,
} from '@/lib/intelligence-engine/memberFacingNoticing';
import { getMemberInterpretation } from '@/lib/member-interpretation';
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
  const supabase = getRequestClient();
  const user = await getCachedUser();
  if (!user) return null;

  const [interpretation, routerDecision] = await Promise.all([
    getMemberInterpretation(),
    decideNextAction(supabase, user.id),
  ]);

  const noticing = buildMemberFacingNoticing({
    findings: interpretation.findings,
    dataFloorNote: interpretation.dataFloor.met ? null : interpretation.dataFloor.statement,
  });

  return { ...noticing, recommendedInvestigation: describeRecommendation(routerDecision) };
}
